import * as THREE from 'three';
import { colorLuminance } from '../utils/colors.js';

export class LabelRenderer {
  constructor(container) {
    this.container = container;
    this.items = [];
    this.labelIndexes = [];
    this.lastColor = '#ffffff';
    this.lastBg = 'rgba(15, 23, 42, 0.6)';
    this.lastFontSize = 12;
    this.lastFontSizes = [];
  }

  clear() {
    this.container.innerHTML = '';
    this.items = [];
    this.labelIndexes = [];
    this.lastFontSizes = [];
  }

  update({ labelsEnabled, count, fontSize, nodes, sizes = [], positions, metrics, camera, viewportWidth, viewportHeight, background, visibleMask = null, focusIndexes = [], getLabel = null }) {
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

    const darkScene = colorLuminance(background) < 0.5;
    const color = darkScene ? '#ffffff' : '#000000';
    const badgeBg = darkScene ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.92)';
    this.lastColor = color;
    this.lastBg = badgeBg;
    this.lastFontSize = fontSize;
    this.lastFontSizes = [];

    for (const idx of this.labelIndexes) {
      const nodeSize = Number(sizes?.[idx]) || 1;
      const resolvedFontSize = Math.max(10, Math.min(22, fontSize + (nodeSize - 1) * 2.4));
      const div = document.createElement('div');
      div.className = 'label-item';
      div.textContent = getLabel ? getLabel(nodes[idx], idx) : (nodes[idx].label || nodes[idx].id);
      div.style.fontSize = `${resolvedFontSize}px`;
      div.style.color = color;
      div.style.background = badgeBg;
      this.container.appendChild(div);
      this.items.push(div);
      this.lastFontSizes.push(resolvedFontSize);
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

  exportLabels(nodes, positions, getLabel = null) {
    if (!this.labelIndexes.length) return [];
    return this.labelIndexes.map((idx, order) => ({
      text: getLabel ? getLabel(nodes[idx], idx) : (nodes[idx]?.label || nodes[idx]?.id || ''),
      position: positions[idx],
      color: this.lastColor,
      fontSize: this.lastFontSizes[order] || this.lastFontSize
    }));
  }
}
