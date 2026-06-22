/**
 * distribution.js — Algoritmos de Distribución Espacial
 * 
 * Implementa:
 * 1. Grilla Hexagonal (Tresbolillo) — para elementos dominantes
 * 2. Poisson Disc Sampling — para relleno de elementos secundarios
 */

import { Vec2, boundingBox } from './geometry.js';

/**
 * Genera puntos en una grilla hexagonal (patrón tresbolillo)
 * 
 * En una grilla hexagonal:
 * - Las filas pares están alineadas
 * - Las filas impares están desplazadas medio espaciado en X
 * - El espaciado vertical es spacing * sqrt(3)/2
 * 
 * @param {Object} bounds - Bounding box { minX, minY, maxX, maxY }
 * @param {number} spacing - Distancia entre centros (= distancia mínima intra-especie)
 * @param {Object} plantableZone - Zona plantable con método contains()
 * @param {number} [offsetX=0] - Desplazamiento horizontal de la grilla
 * @param {number} [offsetY=0] - Desplazamiento vertical de la grilla
 * @param {number} [rotation=0] - Rotación de la grilla en radianes
 * @returns {Vec2[]} Array de posiciones válidas
 */
export function generateHexagonalGrid(bounds, spacing, plantableZone, offsetX = 0, offsetY = 0, rotation = 0) {
  const points = [];
  const rowHeight = spacing * Math.sqrt(3) / 2;
  
  // Expandir bounds para cubrir rotaciones
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const diagonal = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
  
  const expandedMinX = cx - diagonal / 2;
  const expandedMinY = cy - diagonal / 2;
  const expandedMaxX = cx + diagonal / 2;
  const expandedMaxY = cy + diagonal / 2;
  
  let row = 0;
  for (let y = expandedMinY + offsetY; y <= expandedMaxY; y += rowHeight) {
    const xOffset = (row % 2 === 1) ? spacing / 2 : 0;
    
    for (let x = expandedMinX + offsetX + xOffset; x <= expandedMaxX; x += spacing) {
      // Aplicar rotación alrededor del centro
      let px = x, py = y;
      if (rotation !== 0) {
        const dx = x - cx;
        const dy = y - cy;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        px = cx + dx * cos - dy * sin;
        py = cy + dx * sin + dy * cos;
      }
      
      const point = new Vec2(px, py);
      if (plantableZone.contains(point)) {
        points.push(point);
      }
    }
    row++;
  }
  
  return points;
}

/**
 * Poisson Disc Sampling (algoritmo de Bridson)
 * 
 * Genera puntos distribuidos uniformemente con una distancia mínima garantizada
 * entre cada par de puntos. Ideal para relleno natural de elementos secundarios.
 * 
 * @param {Object} bounds - Bounding box { minX, minY, maxX, maxY }
 * @param {number} minDistance - Distancia mínima entre puntos generados
 * @param {Object} plantableZone - Zona plantable con método contains()
 * @param {Function} validationFn - Función adicional de validación (ej. distancia a otros tipos)
 * @param {number} [maxAttempts=30] - Intentos por punto activo antes de descartarlo
 * @param {number|null} [maxPoints=null] - Número máximo de puntos a generar
 * @param {number|null} [seed=null] - Semilla para reproducibilidad
 * @returns {Vec2[]} Array de posiciones válidas
 */
export function poissonDiscSampling(bounds, minDistance, plantableZone, validationFn, maxAttempts = 30, maxPoints = null, seed = null) {
  const cellSize = minDistance / Math.SQRT2;
  const gridWidth = Math.ceil(bounds.width / cellSize);
  const gridHeight = Math.ceil(bounds.height / cellSize);
  
  // Grid de fondo para búsqueda rápida O(1)
  const grid = new Array(gridWidth * gridHeight).fill(-1);
  const points = [];
  const activeList = [];
  
  // RNG con semilla opcional
  const rng = seed !== null ? seededRandom(seed) : Math.random;
  
  /**
   * Convierte coordenadas mundo a índice de grilla
   */
  function toGridIndex(p) {
    const gx = Math.floor((p.x - bounds.minX) / cellSize);
    const gy = Math.floor((p.y - bounds.minY) / cellSize);
    if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return -1;
    return gy * gridWidth + gx;
  }

  /**
   * Verifica que un candidato no esté demasiado cerca de puntos existentes
   * Solo revisa las celdas vecinas (5x5 alrededor)
   */
  function isFarEnough(candidate) {
    const gx = Math.floor((candidate.x - bounds.minX) / cellSize);
    const gy = Math.floor((candidate.y - bounds.minY) / cellSize);
    
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
        
        const idx = ny * gridWidth + nx;
        if (grid[idx] !== -1) {
          const existing = points[grid[idx]];
          if (candidate.distanceTo(existing) < minDistance) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Añade un punto al resultado y a la grilla
   */
  function addPoint(p) {
    const idx = toGridIndex(p);
    if (idx < 0) return false;
    
    const pointIndex = points.length;
    points.push(p);
    grid[idx] = pointIndex;
    activeList.push(pointIndex);
    return true;
  }

  // Generar punto inicial — buscar un punto válido dentro de la zona plantable
  let initialPoint = null;
  for (let attempt = 0; attempt < 1000; attempt++) {
    const x = bounds.minX + rng() * bounds.width;
    const y = bounds.minY + rng() * bounds.height;
    const candidate = new Vec2(x, y);
    
    if (plantableZone.contains(candidate) && (!validationFn || validationFn(candidate))) {
      initialPoint = candidate;
      break;
    }
  }
  
  if (!initialPoint) return []; // No se encontró punto inicial válido
  addPoint(initialPoint);

  // Algoritmo principal de Bridson
  while (activeList.length > 0) {
    if (maxPoints !== null && points.length >= maxPoints) break;
    
    // Seleccionar un punto activo al azar
    const activeIndex = Math.floor(rng() * activeList.length);
    const activePointIndex = activeList[activeIndex];
    const activePoint = points[activePointIndex];
    
    let found = false;
    
    for (let k = 0; k < maxAttempts; k++) {
      if (maxPoints !== null && points.length >= maxPoints) { found = true; break; }
      
      // Generar candidato en anillo [minDistance, 2*minDistance]
      const angle = rng() * Math.PI * 2;
      const radius = minDistance + rng() * minDistance;
      const candidate = new Vec2(
        activePoint.x + radius * Math.cos(angle),
        activePoint.y + radius * Math.sin(angle)
      );
      
      // Verificar bounds
      if (candidate.x < bounds.minX || candidate.x > bounds.maxX ||
          candidate.y < bounds.minY || candidate.y > bounds.maxY) {
        continue;
      }
      
      // Verificar zona plantable
      if (!plantableZone.contains(candidate)) continue;
      
      // Verificar distancia mínima con puntos Poisson existentes
      if (!isFarEnough(candidate)) continue;
      
      // Validación adicional (ej. distancia a elementos de otro tipo)
      if (validationFn && !validationFn(candidate)) continue;
      
      // ¡Candidato válido!
      addPoint(candidate);
      found = true;
    }
    
    // Si no se encontró ningún candidato, remover de la lista activa
    if (!found) {
      activeList.splice(activeIndex, 1);
    }
  }
  
  return points;
}

/**
 * Generador de números pseudoaleatorios con semilla (xorshift128)
 */
function seededRandom(seed) {
  let s = seed;
  return function() {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

/**
 * Optimiza la rotación de la grilla hexagonal para maximizar
 * la cantidad de elementos A dentro del polígono.
 * 
 * Prueba múltiples rotaciones y retorna la mejor configuración.
 */
export function optimizeHexGridRotation(bounds, spacing, plantableZone, steps = 12) {
  let bestCount = 0;
  let bestRotation = 0;
  let bestPoints = [];
  
  for (let i = 0; i < steps; i++) {
    const rotation = (i / steps) * (Math.PI / 3); // Solo necesitamos 0-60° por simetría hexagonal
    const points = generateHexagonalGrid(bounds, spacing, plantableZone, 0, 0, rotation);
    
    if (points.length > bestCount) {
      bestCount = points.length;
      bestRotation = rotation;
      bestPoints = points;
    }
  }
  
  return { rotation: bestRotation, points: bestPoints, count: bestCount };
}

/**
 * Ejecuta la distribución completa: primero A (hexagonal), luego B (Poisson)
 * 
 * @param {Object} config - Configuración completa del motor
 * @returns {Object} Resultado con elementos colocados y estadísticas
 */
export function executeDistribution(config) {
  const {
    bounds,
    plantableZone,
    elementTypes,
    distanceMatrix,
    constraintValidator,
    optimizeRotation = true,
    seed = null
  } = config;

  const results = {
    elements: [],
    stats: {},
    phases: []
  };

  // Fase 1: Distribuir elemento dominante (A) con grilla hexagonal
  const dominantType = elementTypes.find(t => t.role === 'dominant');
  if (dominantType) {
    const spacing = distanceMatrix.getDistance(dominantType.id, dominantType.id);
    
    let gridPoints;
    if (optimizeRotation) {
      const optimized = optimizeHexGridRotation(bounds, spacing, plantableZone, 24);
      gridPoints = optimized.points;
      results.stats.gridRotation = optimized.rotation;
    } else {
      gridPoints = generateHexagonalGrid(bounds, spacing, plantableZone);
    }

    let placedCount = 0;
    for (const point of gridPoints) {
      const result = constraintValidator.tryPlace(point, dominantType.id, `${dominantType.id}_${placedCount}`);
      if (result.success) {
        results.elements.push({
          ...result.element,
          config: dominantType
        });
        placedCount++;
      }

      if (dominantType.maxCount && placedCount >= dominantType.maxCount) break;
    }

    results.phases.push({
      type: dominantType.id,
      algorithm: 'hexagonal_grid',
      placed: placedCount,
      candidates: gridPoints.length
    });
  }

  // Fase 2: Distribuir elementos secundarios (B) con Poisson Disc Sampling
  const secondaryTypes = elementTypes.filter(t => t.role === 'secondary');
  
  for (const secType of secondaryTypes) {
    const minDistSameType = distanceMatrix.getDistance(secType.id, secType.id);
    
    // Función de validación: verificar distancia contra TODOS los tipos ya colocados
    const validationFn = (candidate) => {
      const placed = constraintValidator.getPlacedElements();
      for (const elem of placed) {
        const minDist = distanceMatrix.getDistance(secType.id, elem.type);
        if (candidate.distanceTo(elem.position) < minDist) {
          return false;
        }
      }
      return true;
    };

    const poissonPoints = poissonDiscSampling(
      bounds,
      minDistSameType,
      plantableZone,
      validationFn,
      30,
      secType.maxCount || null,
      seed
    );

    let placedCount = 0;
    for (const point of poissonPoints) {
      const result = constraintValidator.tryPlace(point, secType.id, `${secType.id}_${placedCount}`);
      if (result.success) {
        results.elements.push({
          ...result.element,
          config: secType
        });
        placedCount++;
      }
      if (secType.maxCount && placedCount >= secType.maxCount) break;
    }

    results.phases.push({
      type: secType.id,
      algorithm: 'poisson_disc',
      placed: placedCount,
      candidates: poissonPoints.length
    });
  }

  return results;
}
