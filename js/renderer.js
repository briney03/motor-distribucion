/**
 * renderer.js — Motor de Renderizado Canvas 2D
 * 
 * Renderiza el terreno, caminos, zonas de exclusión, elementos distribuidos,
 * grilla de referencia, y estadísticas en un canvas HTML5 con soporte
 * para zoom, pan, y tooltips interactivos.
 */

import { Vec2, boundingBox, polygonArea, polygonCentroid } from './geometry.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Transformación de vista
    this.view = {
      offsetX: 0,
      offsetY: 0,
      scale: 1,
      rotation: 0
    };
    
    // Estado de interacción
    this.isDragging = false;
    this.lastMouse = { x: 0, y: 0 };
    this.hoveredElement = null;
    
    // Datos a renderizar
    this.terrain = null;
    this.exclusionPolygons = [];
    this.pathLines = [];
    this.elements = [];
    this.elementConfigs = {};
    this.showGrid = false;
    this.gridSpacing = 15;
    this.showCanopies = true;
    this.showLabels = false;
    this.showDistances = false;
    
    // Colores del tema
    this.colors = {
      background: '#0a0e1a',
      terrain: {
        fill: 'rgba(34, 197, 94, 0.12)',
        stroke: '#22c55e',
        strokeWidth: 2.5
      },
      exclusion: {
        fill: 'rgba(239, 68, 68, 0.15)',
        stroke: '#ef4444',
        strokeWidth: 1.5,
        pattern: true
      },
      path: {
        fill: 'rgba(251, 191, 36, 0.2)',
        stroke: '#fbbf24',
        strokeWidth: 2,
        centerLine: 'rgba(251, 191, 36, 0.6)'
      },
      grid: {
        line: 'rgba(148, 163, 184, 0.08)',
        text: 'rgba(148, 163, 184, 0.3)'
      },
      tooltip: {
        bg: 'rgba(15, 23, 42, 0.95)',
        border: 'rgba(99, 102, 241, 0.5)',
        text: '#e2e8f0'
      }
    };
    
    // Configuración de DPI
    this.dpr = window.devicePixelRatio || 1;
    this.resize();
    
    // Event listeners
    this._setupInteraction();
  }

  /**
   * Redimensiona el canvas al tamaño del contenedor con DPI correcto
   */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /**
   * Ajusta la vista para que todo el terreno sea visible
   */
  fitToTerrain() {
    if (!this.terrain || this.terrain.length === 0) return;
    
    const bbox = boundingBox(this.terrain);
    const canvasW = this.canvas.width / this.dpr;
    const canvasH = this.canvas.height / this.dpr;
    const padding = 60;
    
    const scaleX = (canvasW - padding * 2) / bbox.width;
    const scaleY = (canvasH - padding * 2) / bbox.height;
    this.view.scale = Math.min(scaleX, scaleY);
    
    this.view.offsetX = canvasW / 2 - (bbox.minX + bbox.width / 2) * this.view.scale;
    this.view.offsetY = canvasH / 2 - (bbox.minY + bbox.height / 2) * this.view.scale;
  }

  /**
   * Convierte coordenadas del mundo a coordenadas del canvas
   */
  worldToScreen(point) {
    return {
      x: point.x * this.view.scale + this.view.offsetX,
      y: point.y * this.view.scale + this.view.offsetY
    };
  }

  /**
   * Convierte coordenadas del canvas a coordenadas del mundo
   */
  screenToWorld(screenX, screenY) {
    return new Vec2(
      (screenX - this.view.offsetX) / this.view.scale,
      (screenY - this.view.offsetY) / this.view.scale
    );
  }

  /**
   * Configura interacciones de mouse (pan, zoom, hover)
   */
  _setupInteraction() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastMouse = { x: e.offsetX, y: e.offsetY };
      this.canvas.style.cursor = 'grabbing';
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this.isDragging) {
        this.view.offsetX += e.offsetX - this.lastMouse.x;
        this.view.offsetY += e.offsetY - this.lastMouse.y;
        this.lastMouse = { x: e.offsetX, y: e.offsetY };
        this.render();
      } else {
        // Hover detection
        this._updateHover(e.offsetX, e.offsetY);
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      this.canvas.style.cursor = 'grab';
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      this.hoveredElement = null;
      this.canvas.style.cursor = 'grab';
      this.render();
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const mouseX = e.offsetX;
      const mouseY = e.offsetY;
      
      // Zoom centrado en el cursor
      this.view.offsetX = mouseX - (mouseX - this.view.offsetX) * zoomFactor;
      this.view.offsetY = mouseY - (mouseY - this.view.offsetY) * zoomFactor;
      this.view.scale *= zoomFactor;
      
      this.render();
    }, { passive: false });

    this.canvas.style.cursor = 'grab';
  }

  /**
   * Actualiza el elemento bajo el cursor
   */
  _updateHover(screenX, screenY) {
    const worldPos = this.screenToWorld(screenX, screenY);
    let closest = null;
    let closestDist = Infinity;
    
    for (const elem of this.elements) {
      const dist = worldPos.distanceTo(elem.position);
      const config = this.elementConfigs[elem.type];
      const radius = config ? config.displayRadius || 2 : 2;
      
      if (dist < radius * 2 && dist < closestDist) {
        closest = elem;
        closestDist = dist;
      }
    }
    
    if (closest !== this.hoveredElement) {
      this.hoveredElement = closest;
      this.render();
    }
  }

  /**
   * Renderiza todo el frame
   */
  render() {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    
    // Limpiar canvas
    ctx.fillStyle = this.colors.background;
    ctx.fillRect(0, 0, w, h);
    
    // Dibujar capas en orden
    this._drawGrid(ctx);
    this._drawTerrain(ctx);
    this._drawExclusions(ctx);
    this._drawPaths(ctx);
    this._drawElements(ctx);
    this._drawTooltip(ctx);
    this._drawScaleBar(ctx, w, h);
  }

  /**
   * Dibuja la grilla de referencia
   */
  _drawGrid(ctx) {
    if (!this.showGrid || !this.terrain) return;
    
    const bbox = boundingBox(this.terrain);
    const spacing = this.gridSpacing;
    
    ctx.strokeStyle = this.colors.grid.line;
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    
    // Líneas verticales
    for (let x = Math.floor(bbox.minX / spacing) * spacing; x <= bbox.maxX; x += spacing) {
      const s1 = this.worldToScreen({ x, y: bbox.minY });
      const s2 = this.worldToScreen({ x, y: bbox.maxY });
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
    
    // Líneas horizontales
    for (let y = Math.floor(bbox.minY / spacing) * spacing; y <= bbox.maxY; y += spacing) {
      const s1 = this.worldToScreen({ x: bbox.minX, y });
      const s2 = this.worldToScreen({ x: bbox.maxX, y });
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
    
    ctx.setLineDash([]);
  }

  /**
   * Dibuja el polígono del terreno
   */
  _drawTerrain(ctx) {
    if (!this.terrain || this.terrain.length === 0) return;
    
    ctx.beginPath();
    const first = this.worldToScreen(this.terrain[0]);
    ctx.moveTo(first.x, first.y);
    
    for (let i = 1; i < this.terrain.length; i++) {
      const p = this.worldToScreen(this.terrain[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    
    // Fill con gradiente
    const bbox = boundingBox(this.terrain);
    const topLeft = this.worldToScreen({ x: bbox.minX, y: bbox.minY });
    const bottomRight = this.worldToScreen({ x: bbox.maxX, y: bbox.maxY });
    
    const gradient = ctx.createLinearGradient(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
    gradient.addColorStop(0, 'rgba(34, 197, 94, 0.08)');
    gradient.addColorStop(0.5, 'rgba(34, 197, 94, 0.15)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0.08)');
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Stroke con glow
    ctx.shadowColor = '#22c55e';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = this.colors.terrain.stroke;
    ctx.lineWidth = this.colors.terrain.strokeWidth;
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Dibujar vértices del terreno
    for (const v of this.terrain) {
      const s = this.worldToScreen(v);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#0a0e1a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  /**
   * Dibuja las zonas de exclusión
   */
  _drawExclusions(ctx) {
    for (const poly of this.exclusionPolygons) {
      if (poly.length === 0) continue;
      
      ctx.beginPath();
      const first = this.worldToScreen(poly[0]);
      ctx.moveTo(first.x, first.y);
      
      for (let i = 1; i < poly.length; i++) {
        const p = this.worldToScreen(poly[i]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      
      // Fill con patrón de rayas diagonales
      ctx.fillStyle = this.colors.exclusion.fill;
      ctx.fill();
      
      ctx.strokeStyle = this.colors.exclusion.stroke;
      ctx.lineWidth = this.colors.exclusion.strokeWidth;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Dibujar rayas diagonales dentro del polígono
      this._drawHatchPattern(ctx, poly);
    }
  }

  /**
   * Patrón de rayas diagonales para zonas de exclusión
   */
  _drawHatchPattern(ctx, polygon) {
    const bbox = boundingBox(polygon);
    const spacing = 8 / this.view.scale; // Spacing en world coords
    
    ctx.save();
    
    // Clip al polígono
    ctx.beginPath();
    const first = this.worldToScreen(polygon[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < polygon.length; i++) {
      const p = this.worldToScreen(polygon[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.clip();
    
    // Dibujar líneas diagonales
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    ctx.lineWidth = 1;
    
    const startX = bbox.minX;
    const startY = bbox.minY;
    const endX = bbox.maxX;
    const endY = bbox.maxY;
    const totalLen = (endX - startX) + (endY - startY);
    
    for (let d = 0; d < totalLen; d += spacing) {
      const p1x = startX + Math.min(d, endX - startX);
      const p1y = startY + Math.max(0, d - (endX - startX));
      const p2x = startX + Math.max(0, d - (endY - startY));
      const p2y = startY + Math.min(d, endY - startY);
      
      const s1 = this.worldToScreen({ x: p1x, y: p1y });
      const s2 = this.worldToScreen({ x: p2x, y: p2y });
      
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
    }
    
    ctx.restore();
  }

  /**
   * Dibuja las líneas centrales de los caminos
   */
  _drawPaths(ctx) {
    for (const path of this.pathLines) {
      if (path.length < 2) continue;
      
      ctx.beginPath();
      const first = this.worldToScreen(path[0]);
      ctx.moveTo(first.x, first.y);
      
      for (let i = 1; i < path.length; i++) {
        const p = this.worldToScreen(path[i]);
        ctx.lineTo(p.x, p.y);
      }
      
      ctx.strokeStyle = this.colors.path.centerLine;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /**
   * Dibuja los elementos distribuidos
   */
  _drawElements(ctx) {
    // Primero dibujar copas/radios si están activos
    if (this.showCanopies) {
      for (const elem of this.elements) {
        const config = this.elementConfigs[elem.type];
        if (!config) continue;
        
        const s = this.worldToScreen(elem.position);
        const canopyRadius = (config.canopyRadius || config.displayRadius || 3) * this.view.scale;
        
        // Copa/radio de influencia
        const gradient = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, canopyRadius);
        gradient.addColorStop(0, config.canopyColorInner || 'rgba(34, 197, 94, 0.15)');
        gradient.addColorStop(1, config.canopyColorOuter || 'rgba(34, 197, 94, 0.02)');
        
        ctx.beginPath();
        ctx.arc(s.x, s.y, canopyRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
      }
    }
    
    // Luego dibujar los puntos de plantación
    for (const elem of this.elements) {
      const config = this.elementConfigs[elem.type];
      if (!config) continue;
      
      const s = this.worldToScreen(elem.position);
      const isHovered = this.hoveredElement === elem;
      const baseRadius = (config.displayRadius || 3) * this.view.scale;
      const radius = Math.max(isHovered ? 6 : 4, baseRadius);
      
      // Glow effect
      if (isHovered) {
        ctx.shadowColor = config.color || '#22c55e';
        ctx.shadowBlur = 15;
      }
      
      // Punto principal
      ctx.beginPath();
      ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = config.color || '#22c55e';
      ctx.fill();
      
      // Borde
      ctx.strokeStyle = isHovered ? '#ffffff' : (config.borderColor || 'rgba(255,255,255,0.3)');
      ctx.lineWidth = isHovered ? 2 : 1;
      ctx.stroke();
      
      ctx.shadowBlur = 0;
      
      // Icono/símbolo del elemento
      if (config.symbol && this.view.scale > 2) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${Math.max(10, radius * 1.2)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(config.symbol, s.x, s.y);
      }
    }
  }

  /**
   * Dibuja tooltip para el elemento bajo el cursor
   */
  _drawTooltip(ctx) {
    if (!this.hoveredElement) return;
    
    const elem = this.hoveredElement;
    const config = this.elementConfigs[elem.type];
    const s = this.worldToScreen(elem.position);
    
    const lines = [
      `${config?.label || elem.type}`,
      `ID: ${elem.id}`,
      `X: ${elem.position.x.toFixed(2)}m`,
      `Y: ${elem.position.y.toFixed(2)}m`
    ];
    
    const padding = 10;
    const lineHeight = 18;
    const tooltipWidth = 160;
    const tooltipHeight = padding * 2 + lines.length * lineHeight;
    
    let tx = s.x + 15;
    let ty = s.y - tooltipHeight / 2;
    
    // Mantener tooltip dentro del canvas
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    if (tx + tooltipWidth > cw) tx = s.x - tooltipWidth - 15;
    if (ty < 0) ty = 5;
    if (ty + tooltipHeight > ch) ty = ch - tooltipHeight - 5;
    
    // Fondo del tooltip
    ctx.fillStyle = this.colors.tooltip.bg;
    ctx.strokeStyle = this.colors.tooltip.border;
    ctx.lineWidth = 1;
    
    this._roundRect(ctx, tx, ty, tooltipWidth, tooltipHeight, 8);
    ctx.fill();
    ctx.stroke();
    
    // Texto
    ctx.fillStyle = this.colors.tooltip.text;
    ctx.font = '12px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        ctx.font = 'bold 13px "Inter", sans-serif';
        ctx.fillStyle = config?.color || '#e2e8f0';
      } else {
        ctx.font = '11px "Inter", monospace';
        ctx.fillStyle = '#94a3b8';
      }
      ctx.fillText(lines[i], tx + padding, ty + padding + i * lineHeight);
    }
  }

  /**
   * Dibuja barra de escala
   */
  _drawScaleBar(ctx, w, h) {
    const targetScreenLength = 120;
    const worldLength = targetScreenLength / this.view.scale;
    
    // Redondear a un número bonito
    const niceValues = [1, 2, 5, 10, 15, 20, 25, 50, 100, 200, 500];
    let niceLength = niceValues[0];
    for (const v of niceValues) {
      if (v <= worldLength) niceLength = v;
    }
    
    const screenLength = niceLength * this.view.scale;
    const x = w - screenLength - 30;
    const y = h - 30;
    
    // Línea de escala
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + screenLength, y);
    // Ticks
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x, y + 5);
    ctx.moveTo(x + screenLength, y - 5);
    ctx.lineTo(x + screenLength, y + 5);
    ctx.stroke();
    
    // Texto
    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.font = '11px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${niceLength}m`, x + screenLength / 2, y - 8);
  }

  /**
   * Helper: rectángulo redondeado
   */
  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /**
   * Actualiza los datos de renderizado
   */
  setData({ terrain, exclusionPolygons, pathLines, elements, elementConfigs }) {
    if (terrain) this.terrain = terrain;
    if (exclusionPolygons) this.exclusionPolygons = exclusionPolygons;
    if (pathLines) this.pathLines = pathLines;
    if (elements !== undefined) this.elements = elements;
    if (elementConfigs) this.elementConfigs = elementConfigs;
  }
}
