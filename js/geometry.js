/**
 * geometry.js — Núcleo de Geometría Computacional
 * 
 * Operaciones geométricas fundamentales para el motor de distribución:
 * - Point-in-polygon (ray casting)
 * - Área y centroide de polígonos
 * - Buffer de LineString a polígono
 * - Diferencia de polígonos (clipping)
 * - Bounding box
 */

export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vec2(this.x * s, this.y * s); }
  dot(v) { return this.x * v.x + this.y * v.y; }
  cross(v) { return this.x * v.y - this.y * v.x; }
  length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize() {
    const len = this.length();
    return len > 0 ? this.scale(1 / len) : new Vec2(0, 0);
  }
  perpCW() { return new Vec2(this.y, -this.x); }
  perpCCW() { return new Vec2(-this.y, this.x); }
  distanceTo(v) { return this.sub(v).length(); }
  clone() { return new Vec2(this.x, this.y); }

  static fromArray(arr) { return new Vec2(arr[0], arr[1]); }
  toArray() { return [this.x, this.y]; }
}

/**
 * Calcula el área con signo de un polígono (Shoelace formula)
 * Positivo si los vértices están en orden CCW
 */
export function polygonSignedArea(vertices) {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

export function polygonArea(vertices) {
  return Math.abs(polygonSignedArea(vertices));
}

/**
 * Centroide de un polígono
 */
export function polygonCentroid(vertices) {
  const n = vertices.length;
  let cx = 0, cy = 0;
  const signedArea = polygonSignedArea(vertices);
  const a6 = signedArea * 6;
  
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    cx += (vertices[i].x + vertices[j].x) * cross;
    cy += (vertices[i].y + vertices[j].y) * cross;
  }
  
  return new Vec2(cx / a6, cy / a6);
}

/**
 * Bounding box de un conjunto de puntos
 */
export function boundingBox(vertices) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const v of vertices) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Test Point-in-Polygon via Ray Casting
 * Soporta polígonos cóncavos y convexos
 */
export function pointInPolygon(point, polygon) {
  let inside = false;
  const n = polygon.length;
  
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Test si un punto está dentro de ALGUNO de los polígonos plantables
 * (soporta terreno con agujeros / zonas de exclusión)
 */
export function pointInPlantableZone(point, plantablePolygons) {
  for (const poly of plantablePolygons) {
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
}

/**
 * Distancia mínima de un punto a un segmento de línea
 */
export function pointToSegmentDistance(point, a, b) {
  const ab = b.sub(a);
  const ap = point.sub(a);
  const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.dot(ab)));
  const projection = a.add(ab.scale(t));
  return point.distanceTo(projection);
}

/**
 * Distancia mínima de un punto a un LineString
 */
export function pointToLineStringDistance(point, lineString) {
  let minDist = Infinity;
  for (let i = 0; i < lineString.length - 1; i++) {
    const dist = pointToSegmentDistance(point, lineString[i], lineString[i + 1]);
    minDist = Math.min(minDist, dist);
  }
  return minDist;
}

/**
 * Genera un polígono buffer alrededor de un LineString
 * Crea un polígono "gordo" con el ancho especificado
 */
export function bufferLineString(lineString, width) {
  if (lineString.length < 2) return [];
  
  const halfWidth = width / 2;
  const leftSide = [];
  const rightSide = [];
  
  for (let i = 0; i < lineString.length; i++) {
    let normal;
    
    if (i === 0) {
      // Primer punto: normal del primer segmento
      const dir = lineString[1].sub(lineString[0]).normalize();
      normal = dir.perpCCW();
    } else if (i === lineString.length - 1) {
      // Último punto: normal del último segmento
      const dir = lineString[i].sub(lineString[i - 1]).normalize();
      normal = dir.perpCCW();
    } else {
      // Punto intermedio: bisectriz de los segmentos adyacentes
      const dir1 = lineString[i].sub(lineString[i - 1]).normalize();
      const dir2 = lineString[i + 1].sub(lineString[i]).normalize();
      const bisector = dir1.add(dir2).normalize();
      normal = bisector.perpCCW();
      
      // Ajustar longitud para miter join
      const dot = normal.dot(dir1.perpCCW());
      if (Math.abs(dot) > 0.1) {
        normal = normal.scale(1 / dot);
      }
    }
    
    leftSide.push(lineString[i].add(normal.scale(halfWidth)));
    rightSide.push(lineString[i].add(normal.scale(-halfWidth)));
  }
  
  // Construir polígono: lado izquierdo + lado derecho invertido
  return [...leftSide, ...rightSide.reverse()];
}

/**
 * Verifica si un punto está dentro de un polígono buffer de camino
 */
export function pointInExclusionZone(point, exclusionPolygons) {
  for (const poly of exclusionPolygons) {
    if (pointInPolygon(point, poly)) return true;
  }
  return false;
}

/**
 * Intersección de segmentos (para clipping)
 * Retorna el punto de intersección o null
 */
export function segmentIntersection(a1, a2, b1, b2) {
  const d1 = a2.sub(a1);
  const d2 = b2.sub(b1);
  const cross = d1.cross(d2);
  
  if (Math.abs(cross) < 1e-10) return null; // Paralelos
  
  const d = b1.sub(a1);
  const t = d.cross(d2) / cross;
  const u = d.cross(d1) / cross;
  
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return a1.add(d1.scale(t));
  }
  
  return null;
}

/**
 * Perímetro de un polígono
 */
export function polygonPerimeter(vertices) {
  let perimeter = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    perimeter += vertices[i].distanceTo(vertices[j]);
  }
  return perimeter;
}

/**
 * Simplificación: zona plantable = terreno menos exclusiones
 * Usamos un enfoque pragmático: generamos la zona plantable como
 * el terreno original, y validamos cada punto candidato contra
 * AMBAS condiciones (dentro del terreno Y fuera de exclusión)
 */
export function createPlantableZone(terrain, exclusionPolygons) {
  return {
    terrain,
    exclusions: exclusionPolygons,
    contains(point) {
      if (!pointInPolygon(point, terrain)) return false;
      for (const excl of exclusionPolygons) {
        if (pointInPolygon(point, excl)) return false;
      }
      return true;
    }
  };
}
