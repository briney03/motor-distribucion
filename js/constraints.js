/**
 * constraints.js — Solver de Restricciones de Distancia
 * 
 * Gestiona la matriz de distancias mínimas entre tipos de elementos
 * y valida posiciones candidatas usando búsqueda espacial optimizada (spatial hash grid).
 */

/**
 * Clase DistanceMatrix
 * Almacena las restricciones de distancia mínima entre tipos de elementos.
 * 
 * Ejemplo de uso:
 *   const matrix = new DistanceMatrix();
 *   matrix.setDistance('mangostan', 'mangostan', 15);
 *   matrix.setDistance('cacao', 'cacao', 4);
 *   matrix.setDistance('mangostan', 'cacao', 5);
 */
export class DistanceMatrix {
  constructor() {
    this.distances = new Map();
    this.types = new Set();
  }

  /**
   * Establece la distancia mínima entre dos tipos de elementos
   * La relación es simétrica: d(A,B) = d(B,A)
   */
  setDistance(typeA, typeB, distance) {
    this.types.add(typeA);
    this.types.add(typeB);
    const key = this._key(typeA, typeB);
    this.distances.set(key, distance);
  }

  /**
   * Obtiene la distancia mínima requerida entre dos tipos
   */
  getDistance(typeA, typeB) {
    const key = this._key(typeA, typeB);
    return this.distances.get(key) || 0;
  }

  /**
   * Genera una clave simétrica para el par de tipos
   */
  _key(typeA, typeB) {
    return [typeA, typeB].sort().join('::');
  }

  /**
   * Retorna todas las restricciones como array
   */
  getAllConstraints() {
    const result = [];
    for (const [key, distance] of this.distances) {
      const [typeA, typeB] = key.split('::');
      result.push({ typeA, typeB, distance });
    }
    return result;
  }

  /**
   * Retorna la distancia máxima de cualquier restricción
   * (útil para dimensionar el spatial hash)
   */
  getMaxDistance() {
    let max = 0;
    for (const d of this.distances.values()) {
      max = Math.max(max, d);
    }
    return max;
  }
}

/**
 * SpatialHashGrid — Estructura de datos para búsqueda espacial eficiente
 * 
 * Divide el espacio en celdas y permite consultas de vecinos rápidas O(1) amortizado
 * en lugar de O(n) con búsqueda lineal.
 */
export class SpatialHashGrid {
  constructor(cellSize, bounds) {
    this.cellSize = cellSize;
    this.bounds = bounds;
    this.cells = new Map();
    this.items = [];
  }

  /**
   * Calcula la clave de celda para una posición
   */
  _cellKey(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }

  /**
   * Inserta un elemento en la grilla
   */
  insert(item) {
    const key = this._cellKey(item.position.x, item.position.y);
    if (!this.cells.has(key)) {
      this.cells.set(key, []);
    }
    this.cells.get(key).push(item);
    this.items.push(item);
  }

  /**
   * Busca todos los elementos dentro de un radio desde un punto
   * Retorna solo los que están dentro del radio real (no solo en celdas adyacentes)
   */
  queryRadius(point, radius) {
    const results = [];
    const cellRadius = Math.ceil(radius / this.cellSize);
    const cx = Math.floor(point.x / this.cellSize);
    const cy = Math.floor(point.y / this.cellSize);
    
    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const cell = this.cells.get(key);
        if (cell) {
          for (const item of cell) {
            const dist = point.distanceTo(item.position);
            if (dist <= radius) {
              results.push({ item, distance: dist });
            }
          }
        }
      }
    }
    
    return results;
  }

  /**
   * Verifica si una posición candidata cumple con todas las restricciones
   * de distancia respecto a los elementos ya colocados
   */
  validatePosition(position, candidateType, distanceMatrix) {
    // Obtener el radio máximo de búsqueda para este tipo
    const maxSearchRadius = distanceMatrix.getMaxDistance();
    
    // Buscar vecinos dentro del radio máximo
    const neighbors = this.queryRadius(position, maxSearchRadius);
    
    for (const { item, distance } of neighbors) {
      const minDistance = distanceMatrix.getDistance(candidateType, item.type);
      if (distance < minDistance) {
        return {
          valid: false,
          violation: {
            conflictWith: item,
            requiredDistance: minDistance,
            actualDistance: distance
          }
        };
      }
    }
    
    return { valid: true };
  }

  /**
   * Retorna todos los elementos almacenados
   */
  getAllItems() {
    return [...this.items];
  }

  /**
   * Retorna la cantidad de elementos
   */
  get count() {
    return this.items.length;
  }

  /**
   * Limpia toda la grilla
   */
  clear() {
    this.cells.clear();
    this.items = [];
  }
}

/**
 * ConstraintValidator — Validador de alto nivel
 * Combina DistanceMatrix + SpatialHashGrid + zona plantable
 */
export class ConstraintValidator {
  constructor(distanceMatrix, plantableZone, bounds) {
    const cellSize = Math.max(distanceMatrix.getMaxDistance(), 1);
    this.distanceMatrix = distanceMatrix;
    this.plantableZone = plantableZone;
    this.spatialGrid = new SpatialHashGrid(cellSize, bounds);
  }

  /**
   * Intenta colocar un elemento en una posición
   * Retorna { success, reason? }
   */
  tryPlace(position, type, id) {
    // 1. Verificar que está dentro de la zona plantable
    if (!this.plantableZone.contains(position)) {
      return { success: false, reason: 'outside_plantable_zone' };
    }

    // 2. Verificar restricciones de distancia
    const validation = this.spatialGrid.validatePosition(
      position, type, this.distanceMatrix
    );

    if (!validation.valid) {
      return {
        success: false,
        reason: 'distance_violation',
        details: validation.violation
      };
    }

    // 3. Colocar el elemento
    const element = { id, type, position };
    this.spatialGrid.insert(element);
    return { success: true, element };
  }

  /**
   * Retorna todos los elementos colocados
   */
  getPlacedElements() {
    return this.spatialGrid.getAllItems();
  }

  /**
   * Retorna la cantidad de elementos por tipo
   */
  getCountByType() {
    const counts = {};
    for (const item of this.spatialGrid.getAllItems()) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    return counts;
  }

  /**
   * Reinicia el validador
   */
  reset() {
    this.spatialGrid.clear();
  }
}
