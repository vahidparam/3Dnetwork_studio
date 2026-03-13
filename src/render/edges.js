import * as THREE from 'three';

export class EdgeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'edge-layer';
    this.group.renderOrder = 5;
    this.scene.add(this.group);
    this.lastDraw = { polylines: [], colors: [], opacity: 0.18 };
  }

  clear() {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    this.lastDraw = { polylines: [], colors: [], opacity: 0.18 };
  }

  drawPolylines({ polylines, colors, opacity = 0.28 }) {
    while (this.group.children.length) {
      const child = this.group.children[0];
      this.group.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    if (!polylines?.length) {
      this.lastDraw = { polylines: [], colors: [], opacity };
      return;
    }

    const positions = [];
    const colorValues = [];

    for (let i = 0; i < polylines.length; i += 1) {
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

    if (!positions.length) {
      this.lastDraw = { polylines: [], colors: [], opacity };
      return;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorValues, 3));
    geometry.computeBoundingSphere();

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
    this.group.add(segments);
    this.lastDraw = { polylines, colors, opacity };
  }
}
