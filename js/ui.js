/**
 * ui.js — Controlador de Interfaz de Usuario
 * 
 * Conecta el motor de distribución con el renderer y los controles del DOM.
 * Gestiona la interactividad, paneles de configuración y estadísticas.
 */

import { DistributionEngine, DEFAULT_CONFIG } from './engine.js';
import { Renderer } from './renderer.js';

export class UIController {
  constructor() {
    this.engine = new DistributionEngine();
    this.renderer = null;
    this.animationFrame = null;
    this.isInitialized = false;
  }

  /**
   * Inicializa toda la UI
   */
  init() {
    // Inicializar canvas y renderer
    const canvas = document.getElementById('main-canvas');
    if (!canvas) {
      console.error('Canvas #main-canvas not found');
      return;
    }
    
    this.renderer = new Renderer(canvas);
    
    // Configurar resize handler
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.renderer.fitToTerrain();
      this.renderer.render();
    });
    
    // Configurar controles
    this._setupControls();
    
    // Ejecutar distribución inicial
    this._runDistribution();
    
    this.isInitialized = true;
  }

  /**
   * Ejecuta la distribución y actualiza la visualización
   */
  _runDistribution(config = null) {
    const startTime = performance.now();
    
    // Mostrar loading
    this._setStatus('processing');
    
    // Usar setTimeout para permitir que la UI se actualice
    setTimeout(() => {
      try {
        // Inicializar y ejecutar motor
        this.engine.initialize(config || this._getConfigFromUI());
        const results = this.engine.run();
        
        // Actualizar renderer
        const renderData = this.engine.getRenderData();
        this.renderer.setData(renderData);
        this.renderer.fitToTerrain();
        this.renderer.render();
        
        // Actualizar estadísticas
        this._updateStats(results.stats, results.phases);
        this._setStatus('success');
        
      } catch (error) {
        console.error('Distribution error:', error);
        this._setStatus('error', error.message);
      }
    }, 50);
  }

  /**
   * Lee la configuración actual desde los controles de la UI
   */
  _getConfigFromUI() {
    const getValue = (id, fallback) => {
      const el = document.getElementById(id);
      return el ? parseFloat(el.value) || fallback : fallback;
    };

    // Terreno
    const terrainWidth = getValue('terrain-width', 120);
    const terrainHeight = getValue('terrain-height', 80);
    
    const terrain = [
      [5, 5],
      [5 + terrainWidth, 5],
      [5 + terrainWidth, 5 + terrainHeight],
      [5, 5 + terrainHeight]
    ];

    // Terreno personalizado (polígono irregular)
    const terrainShapeSelect = document.getElementById('terrain-shape');
    const terrainShape = terrainShapeSelect ? terrainShapeSelect.value : 'rectangle';
    
    let finalTerrain = terrain;
    if (terrainShape === 'irregular') {
      finalTerrain = [
        [10, 10],
        [60, 5],
        [5 + terrainWidth, 15],
        [5 + terrainWidth - 10, 5 + terrainHeight - 10],
        [70, 5 + terrainHeight],
        [5, 5 + terrainHeight - 15],
        [15, 40]
      ];
    } else if (terrainShape === 'l-shape') {
      const w = terrainWidth;
      const h = terrainHeight;
      finalTerrain = [
        [5, 5],
        [5 + w * 0.5, 5],
        [5 + w * 0.5, 5 + h * 0.5],
        [5 + w, 5 + h * 0.5],
        [5 + w, 5 + h],
        [5, 5 + h]
      ];
    } else if (terrainShape === 'trapezoid') {
      finalTerrain = [
        [5 + terrainWidth * 0.15, 5],
        [5 + terrainWidth * 0.85, 5],
        [5 + terrainWidth, 5 + terrainHeight],
        [5, 5 + terrainHeight]
      ];
    }

    // Camino
    const pathWidth = getValue('path-width', 3);
    const pathStyle = document.getElementById('path-style')?.value || 'straight';
    
    let pathPoints;
    const midY = 5 + (terrainShape === 'rectangle' || terrainShape === 'trapezoid' 
      ? terrainHeight / 2 
      : terrainHeight * 0.6);
    const startX = 5;
    const endX = 5 + terrainWidth;
    
    if (pathStyle === 'straight') {
      pathPoints = [[startX, midY], [endX, midY]];
    } else if (pathStyle === 'curved') {
      pathPoints = [
        [startX, midY],
        [startX + terrainWidth * 0.25, midY - terrainHeight * 0.15],
        [startX + terrainWidth * 0.5, midY + terrainHeight * 0.1],
        [startX + terrainWidth * 0.75, midY - terrainHeight * 0.1],
        [endX, midY]
      ];
    } else if (pathStyle === 'diagonal') {
      pathPoints = [
        [startX, 5 + terrainHeight * 0.2],
        [endX, 5 + terrainHeight * 0.8]
      ];
    } else if (pathStyle === 'zigzag') {
      pathPoints = [
        [startX, midY],
        [startX + terrainWidth * 0.2, midY - terrainHeight * 0.25],
        [startX + terrainWidth * 0.4, midY + terrainHeight * 0.25],
        [startX + terrainWidth * 0.6, midY - terrainHeight * 0.25],
        [startX + terrainWidth * 0.8, midY + terrainHeight * 0.25],
        [endX, midY]
      ];
    }

    // Distancias
    const distAA = getValue('dist-aa', 15);
    const distBB = getValue('dist-bb', 4);
    const distAB = getValue('dist-ab', 5);

    // Cantidad de elementos (límites opcionales)
    const limitMangostan = document.getElementById('limit-mangostan')?.checked ?? false;
    const limitCacao = document.getElementById('limit-cacao')?.checked ?? false;
    const qtyMangostan = limitMangostan ? (parseInt(document.getElementById('qty-mangostan')?.value) || null) : null;
    const qtyCacao = limitCacao ? (parseInt(document.getElementById('qty-cacao')?.value) || null) : null;

    // Construir elementTypes con maxCount del usuario
    const elementTypes = DEFAULT_CONFIG.elementTypes.map(et => {
      const copy = { ...et };
      if (et.id === 'mangostan') copy.maxCount = qtyMangostan;
      if (et.id === 'cacao') copy.maxCount = qtyCacao;
      return copy;
    });

    // Algoritmo
    const optimizeRotation = document.getElementById('optimize-rotation')?.checked ?? true;
    const seedEl = document.getElementById('seed');
    const seed = seedEl && seedEl.value ? parseInt(seedEl.value) : null;

    return {
      terrain: finalTerrain,
      path: { points: pathPoints, width: pathWidth },
      elementTypes,
      distanceConstraints: [
        { typeA: 'mangostan', typeB: 'mangostan', distance: distAA },
        { typeA: 'cacao', typeB: 'cacao', distance: distBB },
        { typeA: 'mangostan', typeB: 'cacao', distance: distAB }
      ],
      algorithm: {
        optimizeRotation,
        rotationSteps: 24,
        poissonAttempts: 30,
        seed
      }
    };
  }

  /**
   * Configura event listeners para los controles
   */
  _setupControls() {
    // Botón ejecutar
    const runBtn = document.getElementById('btn-run');
    if (runBtn) {
      runBtn.addEventListener('click', () => this._runDistribution());
    }

    // Botón reset
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this._resetControls();
        this._runDistribution();
      });
    }

    // Toggle copas
    const canopyToggle = document.getElementById('toggle-canopy');
    if (canopyToggle) {
      canopyToggle.addEventListener('change', (e) => {
        this.renderer.showCanopies = e.target.checked;
        this.renderer.render();
      });
    }

    // Toggle grilla
    const gridToggle = document.getElementById('toggle-grid');
    if (gridToggle) {
      gridToggle.addEventListener('change', (e) => {
        this.renderer.showGrid = e.target.checked;
        this.renderer.render();
      });
    }

    // Exportar GeoJSON
    const exportBtn = document.getElementById('btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this._exportGeoJSON());
    }

    // Exportar Config
    const exportConfigBtn = document.getElementById('btn-export-config');
    if (exportConfigBtn) {
      exportConfigBtn.addEventListener('click', () => this._exportConfig());
    }

    // Quantity limit toggles
    const limitMangostanToggle = document.getElementById('limit-mangostan');
    const limitCacaoToggle = document.getElementById('limit-cacao');
    const qtyMangostanRow = document.getElementById('qty-mangostan-row');
    const qtyCacaoRow = document.getElementById('qty-cacao-row');

    if (limitMangostanToggle && qtyMangostanRow) {
      limitMangostanToggle.addEventListener('change', (e) => {
        qtyMangostanRow.style.display = e.target.checked ? 'flex' : 'none';
      });
    }
    if (limitCacaoToggle && qtyCacaoRow) {
      limitCacaoToggle.addEventListener('change', (e) => {
        qtyCacaoRow.style.display = e.target.checked ? 'flex' : 'none';
      });
    }

    // Sliders con valor visible
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach(slider => {
      const valueDisplay = document.getElementById(slider.id + '-value');
      if (valueDisplay) {
        slider.addEventListener('input', () => {
          valueDisplay.textContent = slider.value + (slider.dataset.unit || '');
        });
      }
    });

    // Zoom controls
    const zoomInBtn = document.getElementById('btn-zoom-in');
    const zoomOutBtn = document.getElementById('btn-zoom-out');
    const zoomFitBtn = document.getElementById('btn-zoom-fit');
    
    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        const cw = this.renderer.canvas.width / this.renderer.dpr;
        const ch = this.renderer.canvas.height / this.renderer.dpr;
        this.renderer.view.offsetX = cw/2 - (cw/2 - this.renderer.view.offsetX) * 1.3;
        this.renderer.view.offsetY = ch/2 - (ch/2 - this.renderer.view.offsetY) * 1.3;
        this.renderer.view.scale *= 1.3;
        this.renderer.render();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        const cw = this.renderer.canvas.width / this.renderer.dpr;
        const ch = this.renderer.canvas.height / this.renderer.dpr;
        this.renderer.view.offsetX = cw/2 - (cw/2 - this.renderer.view.offsetX) * 0.7;
        this.renderer.view.offsetY = ch/2 - (ch/2 - this.renderer.view.offsetY) * 0.7;
        this.renderer.view.scale *= 0.7;
        this.renderer.render();
      });
    }
    if (zoomFitBtn) {
      zoomFitBtn.addEventListener('click', () => {
        this.renderer.fitToTerrain();
        this.renderer.render();
      });
    }
  }

  /**
   * Actualiza el panel de estadísticas
   */
  _updateStats(stats, phases) {
    const setTextContent = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setTextContent('stat-terrain-area', `${parseFloat(stats.terrainArea).toLocaleString()} m²`);
    setTextContent('stat-exclusion-area', `${parseFloat(stats.exclusionArea).toLocaleString()} m²`);
    setTextContent('stat-plantable-area', `${parseFloat(stats.plantableArea).toLocaleString()} m²`);
    setTextContent('stat-total-elements', stats.totalElements);
    setTextContent('stat-exec-time', `${stats.executionTime} ms`);

    // Elementos por tipo
    const typeStatsContainer = document.getElementById('type-stats');
    if (typeStatsContainer) {
      typeStatsContainer.innerHTML = '';
      
      for (const [type, count] of Object.entries(stats.elementsByType)) {
        const config = this.engine.config.elementTypes.find(t => t.id === type);
        const item = document.createElement('div');
        item.className = 'stat-type-item';
        item.innerHTML = `
          <span class="stat-type-dot" style="background: ${config?.color || '#888'}"></span>
          <span class="stat-type-label">${config?.label || type}</span>
          <span class="stat-type-count">${count}</span>
        `;
        typeStatsContainer.appendChild(item);
      }
    }

    // Fases del algoritmo
    const phasesContainer = document.getElementById('algorithm-phases');
    if (phasesContainer) {
      phasesContainer.innerHTML = '';
      
      for (const phase of phases) {
        const config = this.engine.config.elementTypes.find(t => t.id === phase.type);
        const item = document.createElement('div');
        item.className = 'phase-item';
        item.innerHTML = `
          <div class="phase-header">
            <span class="phase-dot" style="background: ${config?.color || '#888'}"></span>
            <span class="phase-label">${config?.label || phase.type}</span>
          </div>
          <div class="phase-details">
            <span>Algoritmo: <strong>${phase.algorithm === 'hexagonal_grid' ? 'Grilla Hexagonal' : 'Poisson Disc'}</strong></span>
            <span>Colocados: <strong>${phase.placed}</strong> / ${phase.candidates} candidatos</span>
          </div>
        `;
        phasesContainer.appendChild(item);
      }
    }

    // Densidad
    const plantableArea = parseFloat(stats.plantableArea);
    if (plantableArea > 0) {
      for (const [type, count] of Object.entries(stats.elementsByType)) {
        const density = (count / (plantableArea / 10000)).toFixed(1); // por hectárea
        setTextContent(`stat-density-${type}`, `${density} /ha`);
      }
    }

    // Actualizar hints de cantidad disponible
    this._updateQuantityHints(stats.elementsByType);
  }

  /**
   * Actualiza los hints que muestran cuántos elementos caben sin límite
   */
  _updateQuantityHints(elementsByType) {
    const hintMap = {
      'mangostan': 'qty-mangostan-hint',
      'cacao': 'qty-cacao-hint'
    };

    for (const [type, hintId] of Object.entries(hintMap)) {
      const hintEl = document.getElementById(hintId);
      if (hintEl) {
        const count = elementsByType[type] || 0;
        hintEl.textContent = `máx. disponible: ${count}`;
      }
    }
  }

  /**
   * Resetea los controles a valores por defecto
   */
  _resetControls() {
    const defaults = {
      'terrain-width': 120,
      'terrain-height': 80,
      'path-width': 3,
      'dist-aa': 15,
      'dist-bb': 4,
      'dist-ab': 5
    };

    for (const [id, value] of Object.entries(defaults)) {
      const el = document.getElementById(id);
      if (el) {
        el.value = value;
        const valueDisplay = document.getElementById(id + '-value');
        if (valueDisplay) valueDisplay.textContent = value + (el.dataset.unit || '');
      }
    }

    const shapeSelect = document.getElementById('terrain-shape');
    if (shapeSelect) shapeSelect.value = 'rectangle';
    
    const pathSelect = document.getElementById('path-style');
    if (pathSelect) pathSelect.value = 'curved';

    // Reset quantity toggles
    const limitMangostan = document.getElementById('limit-mangostan');
    const limitCacao = document.getElementById('limit-cacao');
    if (limitMangostan) { limitMangostan.checked = false; }
    if (limitCacao) { limitCacao.checked = false; }
    const qtyMangostanRow = document.getElementById('qty-mangostan-row');
    const qtyCacaoRow = document.getElementById('qty-cacao-row');
    if (qtyMangostanRow) qtyMangostanRow.style.display = 'none';
    if (qtyCacaoRow) qtyCacaoRow.style.display = 'none';
  }

  /**
   * Exporta resultados como GeoJSON
   */
  _exportGeoJSON() {
    const geojson = this.engine.exportGeoJSON();
    if (!geojson) return;
    
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'distribucion_agroforestal.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Exporta la configuración actual
   */
  _exportConfig() {
    const config = this.engine.exportConfig();
    const blob = new Blob([config], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'configuracion_motor.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Actualiza el estado visual del motor
   */
  _setStatus(status, message = '') {
    const statusEl = document.getElementById('engine-status');
    if (!statusEl) return;
    
    const statusMap = {
      'processing': { text: 'Procesando...', class: 'status-processing', icon: '⏳' },
      'success': { text: 'Distribución completa', class: 'status-success', icon: '✓' },
      'error': { text: `Error: ${message}`, class: 'status-error', icon: '✗' }
    };
    
    const s = statusMap[status] || statusMap['error'];
    statusEl.className = `engine-status ${s.class}`;
    statusEl.innerHTML = `<span class="status-icon">${s.icon}</span> ${s.text}`;
  }
}

// Auto-inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  const ui = new UIController();
  ui.init();
  
  // Exponer para debugging
  window.__distributionEngine = ui;
});
