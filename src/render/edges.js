import * as THREE from 'three';

function disposeChildren(group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    child.geometry?.dispose?.();
    child.material?.dispose?.();
  }
}

function buildSegmentGeometry({ polylines, colors, mask = null }) {
  const positions = [];
  const colorValues = [];

  for (let i = 0; i < polylines.length; i += 1) {
    if (mask && !mask[i]) continue;
    const pts = polylines[i];
    const color = colors[i];
    if (!pts || pts.length < 2 || !color) continue;
    for (let j = 1; j < pts.length; j += 1) {
      const a = pts[j - 1];
      const b = pts[j];
      positions.push(a.x, a.y, a.z ?? 0, b.x, b.y, b.z ?? 0);
      colorValues.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
  }

  if (!positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorValues, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

function buildSegments({ polylines, colors, opacity, mask }) {
  const geometry = buildSegmentGeometry({ polylines, colors, mask });
  if (!geometry) return null;
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const segments = new THREE.LineSegments(geometry, material);
  segments.frustumCulled = false;
  segments.renderOrder = 5;
  return segments;
}

export class EdgeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'edge-layer';
    this.group.renderOrder = 5;
    this.scene.add(this.group);
    this.lastDraw = { polylines: [], colors: [], opacity: 0.18, emphasisMask: [] };
  }

  clear() {
    disposeChildren(this.group);
    this.lastDraw = { polylines: [], colors: [], opacity: 0.18, emphasisMask: [] };
  }

  drawPolylines({ polylines, colors, opacity = 0.28, emphasisMask = null, dimOpacity = 0.1, focusOpacity = 1 }) {
    disposeChildren(this.group);
    if (!polylines?.length) {
      this.lastDraw = { polylines: [], colors: [], opacity, emphasisMask: emphasisMask || [] };
      return;
    }

    const hasFocus = Array.isArray(emphasisMask) && emphasisMask.some(Boolean);
    if (hasFocus) {
      const dimMask = emphasisMask.map((value) => !value);
      const dimSegments = buildSegments({ polylines, colors, opacity: dimOpacity, mask: dimMask });
      const focusSegments = buildSegments({ polylines, colors, opacity: focusOpacity, mask: emphasisMask });
      if (dimSegments) this.group.add(dimSegments);
      if (focusSegments) this.group.add(focusSegments);
    } else {
      const segments = buildSegments({ polylines, colors, opacity, mask: null });
      if (segments) this.group.add(segments);
    }

    this.lastDraw = { polylines, colors, opacity, emphasisMask: emphasisMask || [] };
  }

}
