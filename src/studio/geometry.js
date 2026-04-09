import * as THREE from 'three';
import { boundsFromPositions, evenlySampleIndexes } from '../utils/math.js';

export function clonePositions(positions) {
  return positions.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
}

export function dist3(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function mixPoint(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t
  };
}

export function polylineLength(polyline = []) {
  let length = 0;
  for (let i = 1; i < polyline.length; i += 1) length += dist3(polyline[i - 1], polyline[i]);
  return length;
}

export function samplePolyline(polyline = [], sampleCount = 16) {
  if (!polyline.length) return [];
  if (polyline.length === 1) return [polyline[0]];
  const totalLength = polylineLength(polyline);
  if (totalLength <= 1e-9) return [polyline[0], polyline[polyline.length - 1]];
  const targets = [];
  const safeSamples = Math.max(2, sampleCount);
  for (let i = 0; i < safeSamples; i += 1) targets.push((i / (safeSamples - 1)) * totalLength);

  const output = [];
  let accumulated = 0;
  let segmentIndex = 1;
  for (const target of targets) {
    while (segmentIndex < polyline.length) {
      const a = polyline[segmentIndex - 1];
      const b = polyline[segmentIndex];
      const seg = dist3(a, b);
      if (accumulated + seg >= target || segmentIndex === polyline.length - 1) {
        const local = seg <= 1e-9 ? 0 : (target - accumulated) / seg;
        output.push(mixPoint(a, b, Math.max(0, Math.min(1, local))));
        break;
      }
      accumulated += seg;
      segmentIndex += 1;
    }
  }
  return output;
}

export function chaikinSmooth(polyline = [], iterations = 2) {
  let current = polyline.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  if (current.length < 3) return current;
  for (let iter = 0; iter < iterations; iter += 1) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      const a = current[i];
      const b = current[i + 1];
      next.push(mixPoint(a, b, 0.25));
      next.push(mixPoint(a, b, 0.75));
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

export function buildRawPolylines(graph, positions, visibleMask = null, maxEdges = Infinity) {
  const sourceIndexes = graph.edges
    .map((_, index) => index)
    .filter((index) => {
      const edge = graph.edges[index];
      if (visibleMask && (!visibleMask[edge.sourceIndex] || !visibleMask[edge.targetIndex])) return false;
      return true;
    });

  const picked = sourceIndexes.length > maxEdges
    ? evenlySampleIndexes(sourceIndexes.length, maxEdges).map((i) => sourceIndexes[i])
    : sourceIndexes;

  return picked.map((edgeIndex) => {
    const edge = graph.edges[edgeIndex];
    return {
      edgeIndex,
      points: [positions[edge.sourceIndex], positions[edge.targetIndex]]
    };
  });
}

export function computeBoundsPadding(positions, padding = 0.08) {
  const bounds = boundsFromPositions(positions);
  const padX = Math.max(1, bounds.sizeX * padding);
  const padY = Math.max(1, bounds.sizeY * padding);
  const padZ = Math.max(1, bounds.sizeZ * padding);
  return {
    minX: bounds.minX - padX,
    maxX: bounds.maxX + padX,
    minY: bounds.minY - padY,
    maxY: bounds.maxY + padY,
    minZ: bounds.minZ - padZ,
    maxZ: bounds.maxZ + padZ,
    sizeX: bounds.sizeX + padX * 2,
    sizeY: bounds.sizeY + padY * 2,
    sizeZ: bounds.sizeZ + padZ * 2
  };
}

export function toThreeVector(point) {
  return point instanceof THREE.Vector3 ? point.clone() : new THREE.Vector3(point.x || 0, point.y || 0, point.z || 0);
}

export function makeCurveFromPolyline(polyline = []) {
  const pts = polyline.map(toThreeVector);
  return pts.length >= 2 ? new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5) : null;
}

export function simplifyPolyline(polyline = [], tolerance = 0.75) {
  if (polyline.length <= 2) return polyline.slice();

  function perpendicularDistance(point, a, b) {
    const ax = a.x, ay = a.y, az = a.z || 0;
    const bx = b.x, by = b.y, bz = b.z || 0;
    const px = point.x, py = point.y, pz = point.z || 0;
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const denom = abx * abx + aby * aby + abz * abz;
    const t = denom <= 1e-9 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / denom));
    const cx = ax + abx * t, cy = ay + aby * t, cz = az + abz * t;
    const dx = px - cx, dy = py - cy, dz = pz - cz;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function rdp(points, start, end, out) {
    let maxDist = 0;
    let index = -1;
    for (let i = start + 1; i < end; i += 1) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index !== -1) {
      rdp(points, start, index, out);
      out.pop();
      rdp(points, index, end, out);
    } else {
      out.push(points[start], points[end]);
    }
  }

  const out = [];
  rdp(polyline, 0, polyline.length - 1, out);
  const dedup = [];
  for (const p of out) {
    const last = dedup[dedup.length - 1];
    if (!last || dist3(last, p) > 1e-6) dedup.push(p);
  }
  return dedup;
}
