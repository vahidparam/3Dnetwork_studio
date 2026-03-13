import * as THREE from 'three';

function projectPoint(point, camera, width, height) {
  const v = point instanceof THREE.Vector3 ? point.clone() : new THREE.Vector3(point.x, point.y, point.z || 0);
  v.project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    z: v.z,
    visible: v.z >= -1 && v.z <= 1
  };
}

function projectRadius(point, radius, camera, width, height) {
  const a = projectPoint(point, camera, width, height);
  const b = projectPoint({ x: point.x + radius, y: point.y, z: point.z || 0 }, camera, width, height);
  return Math.max(0.5, Math.abs(b.x - a.x));
}

function colorToCss(color, fallback = 'rgb(94,160,255)') {
  if (!color) return fallback;
  if (typeof color === 'string') return color;
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  return `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSceneSvg({
  camera,
  width,
  height,
  background = '#0f1320',
  transparent = false,
  positions = [],
  sizes = [],
  nodeColors = [],
  polylines = [],
  edgeColors = [],
  edgeOpacity = 0.18,
  labels = []
}) {
  const nodeParts = [];
  const edgeParts = [];
  const labelParts = [];

  if (!transparent) {
    nodeParts.push(`<rect width="100%" height="100%" fill="${escapeXml(background)}"/>`);
  }

  for (let i = 0; i < polylines.length; i += 1) {
    const pts = polylines[i] || [];
    if (pts.length < 2) continue;
    const projected = pts.map((p) => projectPoint(p, camera, width, height)).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (projected.length < 2) continue;
    const d = projected.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
    edgeParts.push(`<path d="${d}" fill="none" stroke="${escapeXml(colorToCss(edgeColors[i], '#9aa5b1'))}" stroke-opacity="${Math.max(0, Math.min(1, edgeOpacity)).toFixed(3)}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`);
  }

  const nodeOrder = positions.map((_, i) => i).sort((a, b) => (positions[a].z || 0) - (positions[b].z || 0));
  for (const i of nodeOrder) {
    const p = positions[i];
    const projected = projectPoint(p, camera, width, height);
    if (!projected.visible) continue;
    const r = projectRadius(p, sizes[i] || 1, camera, width, height);
    nodeParts.push(`<circle cx="${projected.x.toFixed(2)}" cy="${projected.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${escapeXml(colorToCss(nodeColors[i]))}" fill-opacity="0.98"/>`);
  }

  for (const label of labels) {
    const projected = projectPoint(label.position, camera, width, height);
    if (!projected.visible) continue;
    labelParts.push(`<text x="${projected.x.toFixed(2)}" y="${projected.y.toFixed(2)}" text-anchor="middle" dominant-baseline="central" font-family="Inter, Arial, sans-serif" font-size="${Math.max(8, label.fontSize || 12)}" font-weight="600" fill="${escapeXml(label.color || '#f8fbff')}">${escapeXml(label.text)}</text>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${edgeParts.join('\n  ')}
  ${nodeParts.join('\n  ')}
  ${labelParts.join('\n  ')}
</svg>`;
}
