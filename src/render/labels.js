import * as THREE from 'three';
import { colorLuminance } from '../utils/colors.js';

export class LabelRenderer {
  constructor(container) {
    this.container = container;
    this.items = [];
    this.labelIndexes = [];
    this.lastColor = '#f8fbff';
    this.lastFontSize = 12;
  }

  clear() {
    this.container.innerHTML = '';
    this.items = [];
    this.labelIndexes = [];
  }

  update({ labelsEnabled, count, fontSize, nodes, positions, metrics, camera, viewportWidth, viewportHeight, background, visibleMask = null, focusIndexes = [] }) {
    if (!labelsEnabled || !nodes?.length || count <= 0) {
      this.clear();
      return;
    }

    const candidates = nodes.map((_, i) => i).filter((i) => !visibleMask || visibleMask[i]);
    const scoreIndexes = candidates
      .sort((a, b) => (metrics.degree[b] || 0) - (metrics.degree[a] || 0))
      .slice(0, Math.min(count, candidates.length));

    const indexSet = new Set(scoreIndexes);
    for (const focus of focusIndexes || []) {
      if (focus != null && (!visibleMask || visibleMask[focus])) indexSet.add(focus);
    }

    this.container.innerHTML = '';
    this.items = [];
    this.labelIndexes = Array.from(indexSet);

    const color = colorLuminance(background) < 0.45 ? '#f8fbff' : '#16213b';
    this.lastColor = color;
    this.lastFontSize = fontSize;

    for (const idx of this.labelIndexes) {
      const div = document.createElement('div');
      div.className = 'label-item';
      div.textContent = nodes[idx].label || nodes[idx].id;
      div.style.fontSize = `${fontSize}px`;
      div.style.color = color;
      this.container.appendChild(div);
      this.items.push(div);
    }

    this.project(positions, camera, viewportWidth, viewportHeight);
  }

  project(positions, camera, viewportWidth, viewportHeight) {
    if (!this.labelIndexes.length || !this.items.length) return;
    for (let i = 0; i < this.labelIndexes.length; i += 1) {
      const idx = this.labelIndexes[i];
      const pos = positions[idx];
      const projected = pos instanceof THREE.Vector3 ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z || 0);
      projected.project(camera);
      const visible = projected.z >= -1 && projected.z <= 1;
      const item = this.items[i];
      if (!visible) {
        item.style.display = 'none';
        continue;
      }
      item.style.display = '';
      item.style.left = `${(projected.x * 0.5 + 0.5) * viewportWidth}px`;
      item.style.top = `${(-projected.y * 0.5 + 0.5) * viewportHeight}px`;
    }
  }

  exportLabels(nodes, positions) {
    if (!this.labelIndexes.length) return [];
    return this.labelIndexes.map((idx) => ({
      text: nodes[idx]?.label || nodes[idx]?.id || '',
      position: positions[idx],
      color: this.lastColor,
      fontSize: this.lastFontSize
    }));
  }
}
