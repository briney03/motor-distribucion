/**
 * engine.js — Controlador Principal del Motor de Distribución
 * 
 * Orquesta la pipeline completa:
 * Entrada → Geometría → Exclusión → Distribución → Resultado
 */

import { Vec2, boundingBox, bufferLineString, createPlantableZone, polygonArea } from './geometry.js';
import { DistanceMatrix, ConstraintValidator } from './constraints.js';
import { executeDistribution } from './distribution.js';

/**
 * Configuración por defecto del caso de uso agroforestal
 */
export const DEFAULT_CONFIG = {
  // Terreno: polígono rectangular de 120x80 metros
  terrain: [
    [5, 5],
    [125, 5],
    [125, 85],
    [5, 85]
  ],

  // Camino peatonal como LineString
  path: {
    points: [
      [5, 45],
      [40, 45],
      [65, 35],
      [90, 45],
      [125, 45]
    ],
    width: 3 // metros de ancho
  },

  // Tipos de elementos
  elementTypes: [
    {
      id: 'mangostan',
      label: 'Mangostán',
      role: 'dominant',
      symbol: '🌳',
      color: '#10b981',
      borderColor: 'rgba(16, 185, 129, 0.6)',
      displayRadius: 1.2,
      canopyRadius: 6,
      canopyColorInner: 'rgba(16, 185, 129, 0.18)',
      canopyColorOuter: 'rgba(16, 185, 129, 0.02)',
      maxCount: null // Sin límite
    },
    {
      id: 'cacao',
      label: 'Cacao',
      role: 'secondary',
      symbol: '🌱',
      color: '#f59e0b',
      borderColor: 'rgba(245, 158, 11, 0.6)',
      displayRadius: 0.7,
      canopyRadius: 2,
      canopyColorInner: 'rgba(245, 158, 11, 0.15)',
      canopyColorOuter: 'rgba(245, 158, 11, 0.02)',
      maxCount: null
    }
  ],

  // Matriz de restricciones de distancia (metros)
  distanceConstraints: [
    { typeA: 'mangostan', typeB: 'mangostan', distance: 15 },
    { typeA: 'cacao', typeB: 'cacao', distance: 4 },
    { typeA: 'mangostan', typeB: 'cacao', distance: 5 }
  ],

  // Opciones del algoritmo
  algorithm: {
    optimizeRotation: true,
    rotationSteps: 24,
    poissonAttempts: 30,
    seed: null // null = aleatorio
  }
};

/**
 * Clase principal del Motor de Distribución
 */
export class DistributionEngine {
  constructor() {
    this.config = null;
    this.terrain = [];
    this.pathLines = [];
    this.exclusionPolygons = [];
    this.plantableZone = null;
    this.distanceMatrix = null;
    this.results = null;
  }

  /**
   * Inicializa el motor con una configuración
   */
  initialize(config = DEFAULT_CONFIG) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // 1. Parsear terreno
    this.terrain = this.config.terrain.map(p => Vec2.fromArray(p));
    
    // 2. Parsear camino y generar polígono de exclusión
    this.pathLines = [];
    this.exclusionPolygons = [];
    
    if (this.config.path) {
      const pathPoints = this.config.path.points.map(p => Vec2.fromArray(p));
      this.pathLines.push(pathPoints);
      
      const pathPoly = bufferLineString(pathPoints, this.config.path.width);
      if (pathPoly.length > 0) {
        this.exclusionPolygons.push(pathPoly);
      }
    }
    
    // Parsear exclusiones adicionales si existen
    if (this.config.additionalExclusions) {
      for (const excl of this.config.additionalExclusions) {
        this.exclusionPolygons.push(excl.map(p => Vec2.fromArray(p)));
      }
    }
    
    // 3. Crear zona plantable
    this.plantableZone = createPlantableZone(this.terrain, this.exclusionPolygons);
    
    // 4. Construir matriz de distancias
    this.distanceMatrix = new DistanceMatrix();
    for (const constraint of this.config.distanceConstraints) {
      this.distanceMatrix.setDistance(constraint.typeA, constraint.typeB, constraint.distance);
    }
    
    return this;
  }

  /**
   * Ejecuta la distribución completa
   */
  run() {
    if (!this.config) throw new Error('Engine not initialized. Call initialize() first.');
    
    const bounds = boundingBox(this.terrain);
    
    // Crear validador de restricciones
    const constraintValidator = new ConstraintValidator(
      this.distanceMatrix,
      this.plantableZone,
      bounds
    );
    
    // Ejecutar distribución
    const startTime = performance.now();
    
    this.results = executeDistribution({
      bounds,
      plantableZone: this.plantableZone,
      elementTypes: this.config.elementTypes,
      distanceMatrix: this.distanceMatrix,
      constraintValidator,
      optimizeRotation: this.config.algorithm.optimizeRotation,
      seed: this.config.algorithm.seed
    });
    
    const endTime = performance.now();
    
    // Calcular estadísticas
    this.results.stats = {
      ...this.results.stats,
      executionTime: (endTime - startTime).toFixed(2),
      terrainArea: polygonArea(this.terrain).toFixed(2),
      exclusionArea: this.exclusionPolygons.reduce((sum, poly) => sum + polygonArea(poly), 0).toFixed(2),
      totalElements: this.results.elements.length,
      elementsByType: {}
    };
    
    // Contar por tipo
    for (const elem of this.results.elements) {
      const type = elem.type;
      if (!this.results.stats.elementsByType[type]) {
        this.results.stats.elementsByType[type] = 0;
      }
      this.results.stats.elementsByType[type]++;
    }
    
    // Área plantable neta
    this.results.stats.plantableArea = (
      parseFloat(this.results.stats.terrainArea) - parseFloat(this.results.stats.exclusionArea)
    ).toFixed(2);
    
    return this.results;
  }

  /**
   * Retorna datos para el renderer
   */
  getRenderData() {
    const elementConfigs = {};
    for (const et of this.config.elementTypes) {
      elementConfigs[et.id] = et;
    }
    
    return {
      terrain: this.terrain,
      exclusionPolygons: this.exclusionPolygons,
      pathLines: this.pathLines,
      elements: this.results ? this.results.elements : [],
      elementConfigs
    };
  }

  /**
   * Retorna las estadísticas del último run
   */
  getStats() {
    return this.results ? this.results.stats : null;
  }

  /**
   * Retorna las fases del último run
   */
  getPhases() {
    return this.results ? this.results.phases : [];
  }

  /**
   * Actualiza un parámetro de la configuración y re-ejecuta
   */
  updateConfig(partialConfig) {
    this.config = { ...this.config, ...partialConfig };
    this.initialize(this.config);
    return this.run();
  }

  /**
   * Actualiza una restricción de distancia específica
   */
  updateDistance(typeA, typeB, newDistance) {
    const constraint = this.config.distanceConstraints.find(
      c => (c.typeA === typeA && c.typeB === typeB) || (c.typeA === typeB && c.typeB === typeA)
    );
    if (constraint) {
      constraint.distance = newDistance;
    }
    this.initialize(this.config);
    return this.run();
  }

  /**
   * Exporta la configuración actual como JSON
   */
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * Exporta los resultados como GeoJSON
   */
  exportGeoJSON() {
    if (!this.results) return null;
    
    const features = this.results.elements.map(elem => ({
      type: 'Feature',
      properties: {
        id: elem.id,
        type: elem.type,
        label: elem.config?.label || elem.type
      },
      geometry: {
        type: 'Point',
        coordinates: [elem.position.x, elem.position.y]
      }
    }));
    
    // Agregar terreno
    features.unshift({
      type: 'Feature',
      properties: { id: 'terrain', type: 'terrain' },
      geometry: {
        type: 'Polygon',
        coordinates: [this.terrain.map(v => v.toArray())]
      }
    });
    
    return {
      type: 'FeatureCollection',
      features
    };
  }
}
