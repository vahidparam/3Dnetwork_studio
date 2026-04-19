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

  update({ labelsEnabled, count, fontSize, nodes, sizes = [], positions, metrics, camera, viewportWidth, viewportHeight, background, visibleMask = null, focusIndexes = [], selectionMode = false, getLabel = null }) {
    const isSelectionOverride = selectionMode && focusIndexes.length > 0;
    if (!labelsEnabled || !nodes?.length || (count <= 0 && !isSelectionOverride)) {
      this.clear();
      return;
    }

    let indexSet;
    if (isSelectionOverride) {
      // When a node is selected: show ONLY selected node + immediate neighbors
      indexSet = new Set(focusIndexes.filter((f) => f != null && (!visibleMask || visibleMask[f])));
    } else {
      const candidates = nodes.map((_, i) => i).filter((i) => !visibleMask || visibleMask[i]);
      const scoreIndexes = candidates
        .sort((a, b) => (metrics.degree[b] || 0) - (metrics.degree[a] || 0))
        .slice(0, Math.min(count, candidates.length));
      indexSet = new Set(scoreIndexes);
      for (const focus of focusIndexes || []) {
        if (focus != null && (!visibleMask || visibleMask[focus])) indexSet.add(focus);
      }
    }

    this.container.innerHTML = '';
    this.items = [];
    this.labelIndexes = Array.from(indexSet);

    // Project candidates to screen space to compute density-based font size cap.
    // This runs only on update (not every frame), so O(N^2) NN search is acceptable for N <= 200.
    const screenPts = this.labelIndexes.map((idx) => {
      const pos = positions[idx];
      const v = pos instanceof THREE.Vector3 ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z || 0);
      v.project(camera);
      if (v.z < -1 || v.z > 1) return null;
      return { x: (v.x * 0.5 + 0.5) * viewportWidth, y: (-v.y * 0.5 + 0.5) * viewportHeight };
    });

    let densityCap = fontSize;
    const validPts = screenPts.filter(Boolean);
    if (validPts.length > 1) {
      const nnDists = validPts.map((p, i) => {
        let minD = Infinity;
        for (let j = 0; j < validPts.length; j++) {
          if (i === j) continue;
          const dx = p.x - validPts[j].x, dy = p.y - validPts[j].y;
          minD = Math.min(minD, Math.sqrt(dx * dx + dy * dy));
        }
        return minD;
      }).sort((a, b) => a - b);
      const p20 = nnDists[Math.floor(nnDists.length * 0.2)];
      densityCap = Math.max(8, Math.min(fontSize, p20 * 0.55));
    }

    const darkScene = colorLuminance(background) < 0.5;
    const color = darkScene ? '#ffffff' : '#000000';
    const badgeBg = darkScene ? 'rgba(15, 23, 42, 0.6)' : 'rgba(255, 255, 255, 0.92)';
    this.lastColor = color;
    this.lastBg = badgeBg;
    this.lastFontSize = fontSize;
    this.lastFontSizes = [];

    for (const idx of this.labelIndexes) {
      const nodeSize = Number(sizes?.[idx]) || 1;
      const rawSize = Math.max(10, Math.min(22, fontSize + (nodeSize - 1) * 2.4));
      const resolvedFontSize = Math.min(rawSize, densityCap);
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
