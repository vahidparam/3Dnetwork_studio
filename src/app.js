import * as THREE from 'three';
import { loadGraphFromFiles, buildGraph } from './graph.js';
import { SceneController } from './render/scene.js';
import { NodeRenderer } from './render/nodes.js';
import { EdgeRenderer } from './render/edges.js';
import { LabelRenderer } from './render/labels.js';
import { categoricalColor, colorLuminance, ensureContrast, hexToColor, numericRamp, parseLiteralColor, boostVisibility } from './utils/colors.js';
import { evenlySampleIndexes } from './utils/math.js';
import { buildSceneSvg } from './utils/export.js';

function getEl(id) {
  return document.getElementById(id);
}

function setOptions(select, values) {
  select.innerHTML = '';
  if (!values.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '—';
    select.appendChild(option);
    return;
  }
  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function formatValue(value, decimals = 2) {
  return Number(value).toFixed(decimals);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class App {
  constructor() {
    this.state = {
      graph: null,
      base2DPositions: [],
      positions2D: [],
      positions3D: [],
      nodeSizes: [],
      nodeColors: [],
      stage: 1,
      activeView: '2d',
      selectedNodeIndex: null,
      edgeLayer: { kind: 'preview', edgeIndexes: [] }
    };

    this.dom = {
      canvas: getEl('viewport'),
      labelsLayer: getEl('labelsLayer'),
      statusText: getEl('statusText'),
      statsText: getEl('statsText'),
      progressOverlay: getEl('progressOverlay'),
      progressTitle: getEl('progressTitle'),
      progressBar: getEl('progressBar'),
      progressValue: getEl('progressValue'),
      nodeInfoPanel: getEl('nodeInfoPanel'),
      nodeInfoContent: getEl('nodeInfoContent'),
      viewPanel: getEl('floatingViewPanel'),
      showViewPanelBtn: getEl('showViewPanelBtn')
    };

    this.sceneController = new SceneController({
      canvas: this.dom.canvas,
      onRender: (camera) => this.projectLabels(camera)
    });
    this.nodeRenderer = new NodeRenderer(this.sceneController.scene);
    this.edgeRenderer = new EdgeRenderer(this.sceneController.scene);
    this.labelRenderer = new LabelRenderer(this.dom.labelsLayer);
    this.layoutWorker = null;
    this.bundleWorker = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this.bundleModeInfo = {
      straight: 'Straight mode draws direct links only. Use it for inspection, debugging, and very large graphs.',
      arc: 'Arc mode adds a single lifted control point. Increase Lift for more separation; keep Samples moderate for performance.',
      hub: 'Hub bundle routes links through high-degree hubs. Increase Hub count when the graph has multiple communities; reduce it when the result becomes noisy.',
      legacy: 'Shortest-path legacy searches for an alternate route through the graph itself. Lower Path exponent prefers shorter local steps; lower Detour cap keeps routes tighter.'
    };

    this.bindEvents();
    this.bindRangeValueMirrors();
    this.updateStageUI(1);
    this.updateBundlingUI();
    this.applyViewSettings();
  }

  bindEvents() {
    getEl('loadGraphBtn').addEventListener('click', () => this.handleLoadGraph());
    getEl('apply2DBtn').addEventListener('click', () => this.run2D(false));
    getEl('finalize2DBtn').addEventListener('click', () => this.run2D(true));
    getEl('apply3DBtn').addEventListener('click', () => this.run3D(false));
    getEl('finalize3DBtn').addEventListener('click', () => this.run3D(true));
    getEl('backTo2DBtn').addEventListener('click', () => {
      this.state.activeView = '2d';
      this.updateStageUI(2);
      this.renderCurrentView(true);
    });
    getEl('backTo3DBtn').addEventListener('click', () => {
      this.state.activeView = this.state.positions3D.length ? '3d' : '2d';
      this.updateStageUI(3);
      this.renderCurrentView(true);
    });

    getEl('drawEdgesBtn').addEventListener('click', () => this.drawEdges());
    getEl('clearEdgesBtn').addEventListener('click', () => {
      this.drawPreviewEdges();
      this.setStatus('Edge layer reset to preview.');
      this.sceneController.render();
    });

    getEl('backgroundColor').addEventListener('input', () => this.applyViewSettings());
    getEl('nodeDetail').addEventListener('change', () => this.renderNodes());
    getEl('showLabels').addEventListener('change', () => this.renderLabels());
    getEl('labelCount').addEventListener('input', () => this.renderLabels());
    getEl('labelSize').addEventListener('input', () => this.renderLabels());

    [
      'scaleX', 'scaleY', 'layoutGravity', 'layoutRepulsion',
      'nodeSizeMode', 'nodeSizeAttribute', 'nodeSizeMin', 'nodeSizeMax', 'nodeSizeScale',
      'nodeColorMode', 'nodeColorAttribute', 'nodeSingleColor', 'nodeRampColor',
      'fa2BarnesHut', 'fa2AdjustSizes', 'fa2Outbound', 'fa2LinLog'
    ].forEach((id) => {
      const el = getEl(id);
      el.addEventListener(['range', 'color', 'number'].includes(el.type) ? 'input' : 'change', () => this.apply2DVisualPreview());
    });

    ['zMode', 'zAttribute', 'zScale', 'zJitter', 'zCategoryGap'].forEach((id) => {
      const el = getEl(id);
      el.addEventListener(['range', 'number'].includes(el.type) ? 'input' : 'change', () => this.run3D(false));
    });

    ['edgeMode', 'bundleSamples', 'bundleHubCount', 'bundleLift', 'bundleDetour', 'legacyExponent', 'legacyExcludeDirect'].forEach((id) => {
      const el = getEl(id);
      el.addEventListener((el.type === 'range' || el.type === 'checkbox' || el.type === 'number') ? 'input' : 'change', () => {
        if (id === 'edgeMode') this.updateBundlingUI();
        this.setStatus('Bundling parameters updated. Click Draw edges to apply them.');
      });
    });

    ['edgeColorMode', 'edgeSingleColor', 'edgeOpacity'].forEach((id) => {
      const el = getEl(id);
      el.addEventListener((el.type === 'range' || el.type === 'color') ? 'input' : 'change', () => {
        this.redrawCurrentEdgeAppearance();
      });
    });

    getEl('fitViewBtn').addEventListener('click', () => this.sceneController.fitToPositions(this.currentPositions()));
    getEl('resetSceneBtn').addEventListener('click', () => this.resetScene());
    getEl('exportPngBtn').addEventListener('click', () => this.exportPng());
    getEl('exportSvgBtn').addEventListener('click', () => this.exportSvg());
    getEl('exportPdfBtn').addEventListener('click', () => this.exportPdf());
    getEl('hideViewPanelBtn').addEventListener('click', () => this.setViewPanelVisible(false));
    getEl('showViewPanelBtn').addEventListener('click', () => this.setViewPanelVisible(true));

    getEl('toggleSidebarBtn').addEventListener('click', () => {
      const sidebar = getEl('sidebar');
      sidebar.classList.toggle('collapsed');
      getEl('toggleSidebarBtn').textContent = sidebar.classList.contains('collapsed') ? 'Show' : 'Hide';
      this.sceneController.resize();
    });

    [...document.querySelectorAll('.stage-btn')].forEach((button) => {
      button.addEventListener('click', () => {
        const stage = Number(button.dataset.stageTarget);
        if (button.disabled) return;
        this.updateStageUI(stage);
        if (stage <= 2) this.state.activeView = '2d';
        else if (this.state.positions3D.length) this.state.activeView = '3d';
        this.renderCurrentView(true);
      });
    });

    this.pointerDown = null;
    this.dom.canvas.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    });
    this.dom.canvas.addEventListener('pointerup', (event) => {
      if (!this.pointerDown) return;
      const dx = event.clientX - this.pointerDown.x;
      const dy = event.clientY - this.pointerDown.y;
      this.pointerDown = null;
      if ((dx * dx) + (dy * dy) <= 25) this.handleSceneClick(event);
    });
    this.dom.canvas.addEventListener('dblclick', (event) => this.handleSceneClick(event));
    this.dom.canvas.addEventListener('click', (event) => this.handleSceneClick(event));
  }

  bindRangeValueMirrors() {
    const defs = [
      ['scaleX', 'scaleXValue', 1], ['scaleY', 'scaleYValue', 1],
      ['layoutGravity', 'layoutGravityValue', 2], ['layoutRepulsion', 'layoutRepulsionValue', 1],
      ['nodeSizeScale', 'nodeSizeScaleValue', 2], ['zScale', 'zScaleValue', 1], ['zJitter', 'zJitterValue', 1], ['zCategoryGap', 'zCategoryGapValue', 1],
      ['edgeOpacity', 'edgeOpacityValue', 2], ['bundleLift', 'bundleLiftValue', 1], ['bundleDetour', 'bundleDetourValue', 1],
      ['legacyExponent', 'legacyExponentValue', 1]
    ];
    defs.forEach(([inputId, valueId, decimals]) => {
      const input = getEl(inputId);
      const label = getEl(valueId);
      const sync = () => { label.textContent = formatValue(input.value, decimals); };
      input.addEventListener('input', sync);
      sync();
    });
  }

  setStatus(text) { this.dom.statusText.textContent = text; }

  setStats() {
    const graph = this.state.graph;
    this.dom.statsText.textContent = graph
      ? `Nodes: ${graph.nodes.length.toLocaleString()} · Edges: ${graph.edges.length.toLocaleString()}`
      : 'Nodes: 0 · Edges: 0';
  }

  setViewPanelVisible(visible) {
    this.dom.viewPanel.classList.toggle('is-hidden', !visible);
    this.dom.showViewPanelBtn.classList.toggle('hidden', visible);
    this.sceneController.resize();
  }

  showProgress(title) {
    this.dom.progressTitle.textContent = title;
    this.dom.progressBar.value = 0;
    this.dom.progressValue.textContent = '0%';
    this.dom.progressOverlay.classList.remove('hidden');
  }

  setProgress(percent) {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    this.dom.progressBar.value = value;
    this.dom.progressValue.textContent = `${value}%`;
  }

  hideProgress() {
    this.dom.progressOverlay.classList.add('hidden');
  }

  updateStageUI(stage) {
    this.state.stage = stage;
    [...document.querySelectorAll('.stage-panel')].forEach((panel) => {
      panel.classList.toggle('hidden', Number(panel.dataset.stage) !== stage);
    });
    [...document.querySelectorAll('.stage-btn')].forEach((button) => {
      const buttonStage = Number(button.dataset.stageTarget);
      button.classList.toggle('active', buttonStage === stage);
    });
  }

  enableStage(stage, enabled = true) {
    const button = [...document.querySelectorAll('.stage-btn')].find((item) => Number(item.dataset.stageTarget) === stage);
    if (button) button.disabled = !enabled;
  }

  updateBundlingUI() {
    const mode = getEl('edgeMode').value;
    [...document.querySelectorAll('.bundle-group')].forEach((el) => {
      const modes = String(el.dataset.mode || '').split(/\s+/).filter(Boolean);
      el.classList.toggle('hidden', !modes.includes(mode));
    });
    getEl('edgeTuningInfo').textContent = this.bundleModeInfo[mode] || '';
  }

  inferBestNodeColoring({ excludeOriginal = false } = {}) {
    const graph = this.state.graph;
    if (!graph) return { mode: 'single', singleColor: '#7ec8ff', rampColor: '#ff9b66' };

    const reserved = /^(id|label|name|x|y|z|size)$/i;
    const preferred = /(community|modularity|cluster|group|party|category|class|type|faction|bloc)/i;
    const allAttrs = [...graph.attributes.nodeAll].filter((attr) => attr && !reserved.test(attr));

    const colorStats = (colors) => {
      const valid = colors.filter(Boolean);
      const unique = new Set(valid.map((c) => c.getHexString()));
      const darkRatio = valid.length ? valid.filter((c) => colorLuminance(c) < 0.18).length / valid.length : 1;
      const avgLuminance = valid.length ? valid.reduce((sum, c) => sum + colorLuminance(c), 0) / valid.length : 0;
      return { validCount: valid.length, uniqueCount: unique.size, darkRatio, avgLuminance };
    };

    if (!excludeOriginal) {
      const originalStats = colorStats(graph.nodes.map((node) => parseLiteralColor(this.getOriginalNodeColor(node))));
      if (originalStats.validCount >= Math.max(3, Math.floor(graph.nodes.length * 0.2))
        && originalStats.uniqueCount >= 3
        && originalStats.darkRatio < 0.5
        && originalStats.avgLuminance > 0.24) {
        return { mode: 'original' };
      }
    }

    let bestLiteralAttr = null;
    let bestCategoricalAttr = null;
    let bestNumericAttr = null;
    let bestCategoricalScore = -Infinity;
    let bestNumericScore = -Infinity;

    allAttrs.forEach((attr) => {
      const values = graph.nodes
        .map((node) => this.getNodeAttrValue(node, attr))
        .filter((value) => value != null && String(value).trim() !== '');
      if (!values.length) return;

      const literalStats = colorStats(values.map((value) => parseLiteralColor(value)));
      if (literalStats.validCount / values.length > 0.6 && literalStats.uniqueCount >= 3 && literalStats.darkRatio < 0.55 && literalStats.avgLuminance > 0.20) {
        bestLiteralAttr = bestLiteralAttr || attr;
      }

      const numericValues = values.map((value) => this.coerceNumeric(value)).filter((value) => Number.isFinite(value));
      if (numericValues.length >= Math.max(3, Math.floor(values.length * 0.6))) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        if (max > min) {
          const score = (preferred.test(attr) ? 5 : 0) + Math.log10(Math.max(2, numericValues.length));
          if (score > bestNumericScore) {
            bestNumericScore = score;
            bestNumericAttr = attr;
          }
        }
      }

      const uniqueCount = new Set(values.map((value) => String(value))).size;
      const ratio = uniqueCount / Math.max(1, values.length);
      if (uniqueCount >= 2 && uniqueCount <= Math.min(32, Math.max(6, Math.floor(values.length * 0.35))) && ratio < 0.65) {
        const score = (preferred.test(attr) ? 12 : 0) + (12 - uniqueCount) - ratio * 4;
        if (score > bestCategoricalScore) {
          bestCategoricalScore = score;
          bestCategoricalAttr = attr;
        }
      }
    });

    if (bestLiteralAttr) return { mode: 'attribute', attribute: bestLiteralAttr };
    if (bestCategoricalAttr) return { mode: 'attribute', attribute: bestCategoricalAttr };
    if (bestNumericAttr) return { mode: 'attribute', attribute: bestNumericAttr, rampColor: '#ff9b66' };
    return { mode: 'single', singleColor: '#7ec8ff', rampColor: '#ff9b66' };
  }

  ensureVisibleDefaultColors() {
    const background = hexToColor(getEl('backgroundColor').value);
    const singleColor = hexToColor(getEl('nodeSingleColor').value);
    if (Math.abs(colorLuminance(singleColor) - colorLuminance(background)) < 0.24) {
      getEl('nodeSingleColor').value = colorLuminance(background) < 0.45 ? '#7ec8ff' : '#1f57d6';
    }
    const graph = this.state.graph;
    if (!graph) return;

    const suggestion = this.inferBestNodeColoring();
    if (suggestion.mode) getEl('nodeColorMode').value = suggestion.mode;
    if (suggestion.attribute) {
      const attrSelect = getEl('nodeColorAttribute');
      const hasOption = [...attrSelect.options].some((option) => option.value === suggestion.attribute);
      if (hasOption) attrSelect.value = suggestion.attribute;
    }
    if (suggestion.singleColor) getEl('nodeSingleColor').value = suggestion.singleColor;
    if (suggestion.rampColor) getEl('nodeRampColor').value = suggestion.rampColor;
  }

  async handleLoadGraph() {
    const gexfFile = getEl('gexfFile').files[0];
    const nodesCsvFile = getEl('nodesCsvFile').files[0];
    const edgesCsvFile = getEl('edgesCsvFile').files[0];
    try {
      this.setStatus('Loading graph…');
      const rawGraph = await loadGraphFromFiles({ gexfFile, nodesCsvFile, edgesCsvFile });
      this.state.graph = buildGraph(rawGraph);
      this.state.base2DPositions = [];
      this.state.positions2D = [];
      this.state.positions3D = [];
      this.state.nodeSizes = [];
      this.state.nodeColors = [];
      this.state.activeView = '2d';
      this.state.selectedNodeIndex = null;
      this.hideSelectedNode();
      this.edgeRenderer.clear();

      this.populateAttributeMenus();
      this.ensureVisibleDefaultColors();
      this.setStats();
      this.enableStage(2, true);
      this.enableStage(3, true);
      this.enableStage(4, true);
      getEl('positionSource').value = this.state.graph.flags.has2DPositions ? 'existing' : 'forceatlas2';
      getEl('zMode').value = this.state.graph.flags.hasZPositions ? 'original' : 'flat';

      await this.run2D(false);
      this.updateStageUI(2);
      this.setStatus('Graph loaded. Adjust the 2D layout.');
    } catch (error) {
      console.error(error);
      this.hideProgress();
      const message = error?.message || 'Failed to load graph.';
      this.setStatus(message);
      alert(message)
    }
  }

  populateAttributeMenus() {
    const graph = this.state.graph;
    const colorAttributes = [...graph.attributes.nodeAll];
    if (!colorAttributes.includes('color')) colorAttributes.unshift('color');
    const zAttributes = [...graph.attributes.nodeAll];
    if (!zAttributes.includes('size') && graph.attributes.nodeNumeric.includes('size')) zAttributes.unshift('size');
    setOptions(getEl('nodeSizeAttribute'), graph.attributes.nodeNumeric);
    setOptions(getEl('nodeColorAttribute'), colorAttributes);
    setOptions(getEl('zAttribute'), zAttributes);

    if (colorAttributes.length) getEl('nodeColorAttribute').value = colorAttributes[0];
    if (zAttributes.length) getEl('zAttribute').value = zAttributes[0];
    if (!graph.attributes.nodeNumeric.length) {
      getEl('nodeSizeMode').value = 'degree';
      getEl('zMode').value = graph.flags.hasZPositions ? 'original' : 'degree';
    }
  }

  collect2DSettings() {
    return {
      positionSource: getEl('positionSource').value,
      iterations: Number(getEl('layoutIterations').value),
      gravity: Number(getEl('layoutGravity').value),
      repulsion: Number(getEl('layoutRepulsion').value),
      scaleX: Number(getEl('scaleX').value),
      scaleY: Number(getEl('scaleY').value),
      nodeSizeMode: getEl('nodeSizeMode').value,
      nodeSizeAttribute: getEl('nodeSizeAttribute').value,
      nodeSizeMin: Number(getEl('nodeSizeMin').value),
      nodeSizeMax: Number(getEl('nodeSizeMax').value),
      nodeSizeScale: Number(getEl('nodeSizeScale').value),
      nodeColorMode: getEl('nodeColorMode').value,
      nodeColorAttribute: getEl('nodeColorAttribute').value,
      nodeSingleColor: getEl('nodeSingleColor').value,
      nodeRampColor: getEl('nodeRampColor').value,
      fa2BarnesHut: getEl('fa2BarnesHut').checked,
      fa2AdjustSizes: getEl('fa2AdjustSizes').checked,
      fa2Outbound: getEl('fa2Outbound').checked,
      fa2LinLog: getEl('fa2LinLog').checked
    };
  }

  collect3DSettings() {
    return {
      zMode: getEl('zMode').value,
      zAttribute: getEl('zAttribute').value,
      zScale: Number(getEl('zScale').value),
      zJitter: Number(getEl('zJitter').value),
      zCategoryGap: Number(getEl('zCategoryGap').value)
    };
  }

  collectEdgeSettings() {
    return {
      algorithm: getEl('edgeMode').value,
      samples: Number(getEl('bundleSamples').value),
      hubCount: Number(getEl('bundleHubCount').value),
      lift: Number(getEl('bundleLift').value),
      detourCap: Number(getEl('bundleDetour').value),
      exponent: Number(getEl('legacyExponent').value),
      excludeDirect: getEl('legacyExcludeDirect').checked,
      edgeColorMode: getEl('edgeColorMode').value,
      edgeSingleColor: getEl('edgeSingleColor').value,
      edgeOpacity: Number(getEl('edgeOpacity').value)
    };
  }

  getExportOptions() {
    return {
      scale: Math.max(1, Number(getEl('exportScale').value) || 2),
      transparent: getEl('transparentExport').checked
    };
  }

  async run2D(finalize) {
    const graph = this.state.graph;
    if (!graph) return;
    const settings = this.collect2DSettings();
    const basePositions = await this.compute2DLayout(settings);
    this.state.base2DPositions = basePositions;
    this.state.activeView = '2d';
    this.apply2DVisualPreview();
    if (!this.state.positions3D.length) this.sceneController.fitToPositions(this.state.positions2D);
    this.setStatus(finalize ? '2D layout finalized. Map the graph into 3D.' : '2D layout applied.');
    if (finalize) this.updateStageUI(3);
  }

  async compute2DLayout(settings) {
    const graph = this.state.graph;
    if (settings.positionSource !== 'forceatlas2') {
      return this.computeFast2DLayout(settings.positionSource, graph);
    }

    this.showProgress('Computing ForceAtlas2 layout…');
    if (this.layoutWorker) this.layoutWorker.terminate();
    this.layoutWorker = new Worker(new URL('./workers/layoutWorker.js', import.meta.url), { type: 'module' });

    return new Promise((resolve, reject) => {
      this.layoutWorker.onmessage = (event) => {
        const { type, positions, percent } = event.data;
        if (type === 'progress') return this.setProgress(percent);
        if (type === 'result') {
          this.hideProgress();
          this.layoutWorker.terminate();
          this.layoutWorker = null;
          resolve(positions);
        }
      };
      this.layoutWorker.onerror = (error) => {
        this.hideProgress();
        this.layoutWorker?.terminate();
        this.layoutWorker = null;
        reject(error);
      };
      this.layoutWorker.postMessage({
        nodes: graph.nodes.map((node) => ({ x: node.x, y: node.y })),
        edges: graph.edges.map((edge) => ({ sourceIndex: edge.sourceIndex, targetIndex: edge.targetIndex, weight: edge.weight })),
        iterations: settings.iterations,
        gravity: settings.gravity,
        repulsion: settings.repulsion,
        barnesHutOptimize: settings.fa2BarnesHut,
        adjustSizes: settings.fa2AdjustSizes,
        outboundAttractionDistribution: settings.fa2Outbound,
        linLogMode: settings.fa2LinLog
      });
    });
  }

  computeFast2DLayout(mode, graph) {
    const nodes = graph.nodes;
    const count = nodes.length;
    if (mode === 'existing') {
      const hasExisting = nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));
      if (hasExisting) return nodes.map((node) => ({ x: node.x, y: node.y }));
      mode = 'random';
    }
    if (mode === 'circular') {
      const radius = Math.max(10, Math.sqrt(count) * 3);
      return nodes.map((_, i) => {
        const angle = (i / Math.max(1, count)) * Math.PI * 2;
        return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      });
    }
    if (mode === 'grid') {
      const side = Math.ceil(Math.sqrt(count));
      const spacing = 5;
      return nodes.map((_, i) => {
        const row = Math.floor(i / side);
        const col = i % side;
        return { x: (col - side / 2) * spacing, y: (row - side / 2) * spacing };
      });
    }
    if (mode === 'radial') {
      const indexed = nodes.map((node, i) => ({ i, score: graph.metrics?.degree?.[i] || Number(node.size) || 1 }));
      indexed.sort((a, b) => b.score - a.score);
      const positions = new Array(count);
      indexed.forEach((entry, rank) => {
        const ring = Math.floor(Math.sqrt(rank));
        const ringSize = Math.max(6, ring * 8);
        const idxInRing = rank - (ring * ring);
        const angle = (idxInRing / ringSize) * Math.PI * 2;
        const radius = 8 + ring * 7;
        positions[entry.i] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
      });
      return positions;
    }
    return nodes.map((_, i) => ({
      x: (Math.random() - 0.5) * Math.max(30, Math.sqrt(count) * 4) + (i % 3),
      y: (Math.random() - 0.5) * Math.max(30, Math.sqrt(count) * 4) - (i % 5)
    }));
  }

  apply2DVisualPreview() {
    const graph = this.state.graph;
    if (!graph || !this.state.base2DPositions.length) return;
    const settings = this.collect2DSettings();
    this.state.positions2D = this.state.base2DPositions.map((p) => ({ x: p.x * settings.scaleX, y: p.y * settings.scaleY, z: 0 }));
    this.computeNodeEncodings(settings);
    if (this.state.activeView === '2d' || !this.state.positions3D.length) {
      this.renderCurrentView();
    } else {
      this.run3D(false);
    }
  }

  getNodeAttrValue(node, attrName) {
    if (!attrName) return undefined;
    if (attrName === 'color') return this.getOriginalNodeColor(node);
    if (attrName === 'size') return node.size;
    if (Object.prototype.hasOwnProperty.call(node.attrs, attrName)) return node.attrs[attrName];
    const foundKey = Object.keys(node.attrs).find((key) => key.toLowerCase() === String(attrName).toLowerCase());
    return foundKey ? node.attrs[foundKey] : undefined;
  }

  getOriginalNodeColor(node) {
    return node.color ?? node.attrs.color ?? node.attrs.Color ?? node.attrs.colour ?? node.attrs.Colour;
  }

  coerceNumeric(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return NaN;
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed)) return parsed;
    }
    return NaN;
  }

  computeNodeEncodings(settings) {
    const graph = this.state.graph;
    const nodeSizes = new Array(graph.nodes.length);
    const nodeColors = new Array(graph.nodes.length);

    let sizeValues = graph.nodes.map(() => 1);
    if (settings.nodeSizeMode === 'degree') sizeValues = [...graph.metrics.degree];
    else if (settings.nodeSizeMode === 'weightedDegree') sizeValues = [...graph.metrics.weightedDegree];
    else if (settings.nodeSizeMode === 'attribute') sizeValues = graph.nodes.map((node) => this.coerceNumeric(this.getNodeAttrValue(node, settings.nodeSizeAttribute)));
    else if (settings.nodeSizeMode === 'original') sizeValues = graph.nodes.map((node) => this.coerceNumeric(node.size));

    const finiteSizes = sizeValues.filter((value) => Number.isFinite(value));
    const minValue = finiteSizes.length ? Math.min(...finiteSizes) : 0;
    const maxValue = finiteSizes.length ? Math.max(...finiteSizes) : 1;
    for (let i = 0; i < graph.nodes.length; i += 1) {
      const normalized = Number.isFinite(sizeValues[i]) ? (sizeValues[i] - minValue) / ((maxValue - minValue) || 1) : 0;
      const base = settings.nodeSizeMode === 'constant'
        ? settings.nodeSizeMin
        : settings.nodeSizeMin + normalized * (settings.nodeSizeMax - settings.nodeSizeMin);
      nodeSizes[i] = Math.max(0.0001, base * settings.nodeSizeScale);
    }

    const background = hexToColor(getEl('backgroundColor').value);
    let numericRange = null;
    let literalColorRatio = 0;
    let categoricalCount = 0;

    if (settings.nodeColorMode === 'attribute') {
      const values = graph.nodes.map((node) => this.getNodeAttrValue(node, settings.nodeColorAttribute));
      const numericValues = values.map((value) => this.coerceNumeric(value)).filter((value) => Number.isFinite(value));
      const parsedLiteralColors = values.map((value) => parseLiteralColor(value));
      literalColorRatio = parsedLiteralColors.filter(Boolean).length / Math.max(1, values.length);
      categoricalCount = new Set(values.filter((value) => value != null && String(value).trim() !== '').map((value) => String(value))).size;
      if (numericValues.length && literalColorRatio < 0.5) {
        numericRange = { min: Math.min(...numericValues), max: Math.max(...numericValues) };
      }
      if (literalColorRatio > 0.6) getEl('nodeColorHint').textContent = 'The selected attribute contains explicit colors. They are now used directly.';
      else if (numericRange) getEl('nodeColorHint').textContent = 'The selected attribute is numeric. Nodes use a continuous color ramp.';
      else getEl('nodeColorHint').textContent = `The selected attribute is treated as categorical (${categoricalCount} categories detected).`;
    } else if (settings.nodeColorMode === 'original') {
      getEl('nodeColorHint').textContent = 'Using original node colors from the uploaded graph when available.';
    } else {
      getEl('nodeColorHint').textContent = 'Single color mode applies one consistent color to all nodes.';
    }

    for (let i = 0; i < graph.nodes.length; i += 1) {
      const node = graph.nodes[i];
      let color = boostVisibility(hexToColor(settings.nodeSingleColor), 0.06);
      if (settings.nodeColorMode === 'single') {
        color = hexToColor(settings.nodeSingleColor);
      } else if (settings.nodeColorMode === 'original') {
        color = parseLiteralColor(this.getOriginalNodeColor(node)) || hexToColor(settings.nodeSingleColor);
      } else if (settings.nodeColorMode === 'attribute') {
        const value = this.getNodeAttrValue(node, settings.nodeColorAttribute);
        const literalColor = parseLiteralColor(value);
        const numericValue = this.coerceNumeric(value);
        if (literalColor) {
          color = literalColor;
        } else if (numericRange && Number.isFinite(numericValue)) {
          color = numericRamp(numericValue, numericRange.min, numericRange.max, settings.nodeSingleColor, settings.nodeRampColor);
        } else if (value != null && String(value).trim() !== '') {
          color = categoricalColor(value);
        } else {
          color = parseLiteralColor(this.getOriginalNodeColor(node)) || hexToColor(settings.nodeSingleColor);
        }
      }
      color = ensureContrast(color, background);
      if (colorLuminance(background) < 0.45) {
        const lum = colorLuminance(color);
        const hsl = {};
        color.getHSL(hsl);
        if (lum < 0.18 && hsl.s < 0.08) {
          color = hexToColor(settings.nodeSingleColor);
        } else if (lum < 0.38) {
          color = boostVisibility(color, Math.max(0.18, 0.42 - lum));
        }
      }
      nodeColors[i] = color;
    }

    const uniqueCount = new Set(nodeColors.map((color) => color.getHexString())).size;
    const darkRatio = nodeColors.filter((color) => colorLuminance(color) < 0.22).length / Math.max(1, nodeColors.length);
    if ((settings.nodeColorMode === 'original' || settings.nodeColorMode === 'attribute') && (uniqueCount <= 2 || darkRatio > 0.72)) {
      const fallback = this.inferBestNodeColoring({ excludeOriginal: true });
      if (fallback.mode === 'attribute' && fallback.attribute && fallback.attribute !== settings.nodeColorAttribute) {
        getEl('nodeColorMode').value = 'attribute';
        getEl('nodeColorAttribute').value = fallback.attribute;
        if (fallback.rampColor) getEl('nodeRampColor').value = fallback.rampColor;
        getEl('nodeColorHint').textContent = `The previous coloring had very low visible contrast, so the view switched to ${fallback.attribute}.`;
        return this.computeNodeEncodings({
          ...settings,
          nodeColorMode: 'attribute',
          nodeColorAttribute: fallback.attribute,
          nodeRampColor: fallback.rampColor || settings.nodeRampColor
        });
      }
      if (settings.nodeColorMode !== 'single') {
        getEl('nodeColorMode').value = 'single';
        getEl('nodeColorHint').textContent = 'The previous coloring had very low visible contrast, so the view switched to a brighter single color.';
        return this.computeNodeEncodings({
          ...settings,
          nodeColorMode: 'single',
          nodeSingleColor: '#7ec8ff'
        });
      }
    }

    this.state.nodeSizes = nodeSizes;
    this.state.nodeColors = nodeColors;
  }

  getCategoricalLayerMap(attrName) {
    const graph = this.state.graph;
    const values = graph.nodes.map((node) => this.getNodeAttrValue(node, attrName));
    const distinct = [...new Set(values.filter((value) => value != null && String(value).trim() !== '').map((value) => String(value)))].sort((a, b) => a.localeCompare(b));
    return new Map(distinct.map((value, index) => [value, index]));
  }

  describeZMode(settings) {
    const graph = this.state.graph;
    if (!graph) return;
    if (settings.zMode !== 'attribute') {
      getEl('zHint').textContent = 'Choose a node attribute to map numeric values or categorical groups into depth.';
      return;
    }
    const rawValues = graph.nodes.map((node) => this.getNodeAttrValue(node, settings.zAttribute));
    const numericValues = rawValues.map((value) => this.coerceNumeric(value)).filter((value) => Number.isFinite(value));
    const nonEmpty = rawValues.filter((value) => value != null && String(value).trim() !== '');
    const categoricalCount = new Set(nonEmpty.map((value) => String(value))).size;
    if (numericValues.length >= Math.max(3, Math.floor(nonEmpty.length * 0.6))) {
      getEl('zHint').textContent = 'The selected Z attribute is numeric. Values are scaled continuously in depth.';
    } else {
      getEl('zHint').textContent = `The selected Z attribute is categorical. ${categoricalCount} depth layers are currently detected.`;
    }
  }

  run3D(finalize) {
    const graph = this.state.graph;
    if (!graph) return;
    const settings = this.collect3DSettings();
    this.describeZMode(settings);
    const base2D = this.state.positions2D.length
      ? this.state.positions2D
      : graph.nodes.map((node) => ({ x: node.x || 0, y: node.y || 0, z: 0 }));

    let categoricalLayerMap = null;
    let numericRange = null;
    if (settings.zMode === 'attribute') {
      const rawValues = graph.nodes.map((node) => this.getNodeAttrValue(node, settings.zAttribute));
      const numericValues = rawValues.map((value) => this.coerceNumeric(value)).filter((value) => Number.isFinite(value));
      if (numericValues.length >= Math.max(3, Math.floor(Math.max(1, rawValues.length) * 0.6))) {
        numericRange = { min: Math.min(...numericValues), max: Math.max(...numericValues) };
      } else {
        categoricalLayerMap = this.getCategoricalLayerMap(settings.zAttribute);
      }
    }

    this.state.positions3D = base2D.map((pos, index) => {
      const node = graph.nodes[index];
      let z = 0;
      if (settings.zMode === 'original') z = Number.isFinite(node.z) ? node.z : 0;
      else if (settings.zMode === 'random') z = (Math.random() - 0.5) * settings.zScale * 10;
      else if (settings.zMode === 'degree') z = graph.metrics.degree[index];
      else if (settings.zMode === 'weightedDegree') z = graph.metrics.weightedDegree[index];
      else if (settings.zMode === 'attribute') {
        const raw = this.getNodeAttrValue(node, settings.zAttribute);
        const numeric = this.coerceNumeric(raw);
        if (numericRange && Number.isFinite(numeric)) {
          const t = (numeric - numericRange.min) / ((numericRange.max - numericRange.min) || 1);
          z = (t - 0.5) * 2 * settings.zScale * 10;
        } else if (categoricalLayerMap && raw != null && String(raw).trim() !== '') {
          const layer = categoricalLayerMap.get(String(raw)) || 0;
          const centered = layer - ((categoricalLayerMap.size - 1) / 2);
          z = centered * settings.zCategoryGap;
        }
      }
      if (settings.zMode !== 'random' && settings.zMode !== 'attribute') z *= settings.zScale;
      if (settings.zJitter > 0) z += (Math.random() - 0.5) * settings.zJitter * 10;
      return { x: pos.x, y: pos.y, z };
    });

    this.state.activeView = '3d';
    this.renderCurrentView(true);
    this.sceneController.fitToPositions(this.state.positions3D);
    this.setStatus(finalize ? '3D mapping finalized. Draw edges or run bundling.' : '3D mapping applied.');
    if (finalize) this.updateStageUI(4);
  }

  currentPositions() {
    if (this.state.activeView === '3d' && this.state.positions3D.length) return this.state.positions3D;
    if (this.state.positions2D.length) return this.state.positions2D;
    if (this.state.positions3D.length) return this.state.positions3D;
    return [];
  }

  renderCurrentView(resetEdges = true) {
    this.renderNodes();
    if (resetEdges || this.state.edgeLayer.kind !== 'custom' || !this.edgeRenderer.lastDraw.polylines.length) {
      this.drawPreviewEdges();
    } else {
      this.redrawCurrentEdgeAppearance();
    }
    this.sceneController.render();
  }

  renderNodes() {
    const positions = this.currentPositions();
    if (!positions.length) return;
    this.nodeRenderer.update({
      positions,
      sizes: this.state.nodeSizes.length ? this.state.nodeSizes : positions.map(() => 1),
      colors: this.state.nodeColors.length ? this.state.nodeColors : positions.map(() => new THREE.Color('#6fb1ff')),
      detail: Number(getEl('nodeDetail').value)
    });
    this.renderLabels();
    this.sceneController.render();
  }

  renderLabels() {
    const graph = this.state.graph;
    const positions = this.currentPositions();
    if (!graph || !positions.length) {
      this.labelRenderer.clear();
      return;
    }
    this.labelRenderer.update({
      labelsEnabled: getEl('showLabels').checked,
      count: Number(getEl('labelCount').value),
      fontSize: Number(getEl('labelSize').value),
      nodes: graph.nodes,
      positions,
      metrics: graph.metrics,
      camera: this.sceneController.camera,
      viewportWidth: this.dom.canvas.clientWidth,
      viewportHeight: this.dom.canvas.clientHeight,
      background: hexToColor(getEl('backgroundColor').value)
    });
  }

  projectLabels(camera) {
    const positions = this.currentPositions();
    if (!positions.length) return;
    this.labelRenderer.project(positions, camera, this.dom.canvas.clientWidth, this.dom.canvas.clientHeight);
  }

  applyViewSettings() {
    this.sceneController.setBackground(getEl('backgroundColor').value);
    if (this.state.graph) {
      this.computeNodeEncodings(this.collect2DSettings());
      this.renderNodes();
      if (this.state.edgeLayer.kind === 'custom' && this.edgeRenderer.lastDraw.polylines.length) this.redrawCurrentEdgeAppearance();
      else this.drawPreviewEdges();
    } else {
      this.renderLabels();
    }
  }

  previewEdgeSelection(positions, algorithm = 'straight') {
    const graph = this.state.graph;
    if (!graph || !positions.length) return { edges: [], indexes: [], subset: null };
    const pointBudget = Math.max(2000, Number(getEl('pointBudget').value) || 300000);
    const samples = Math.max(2, Number(getEl('bundleSamples').value) || 8);
    const multiplier = algorithm === 'straight' ? 2 : Math.max(4, samples * 2);
    const maxPreviewEdges = Math.max(120, Math.floor(pointBudget / multiplier));
    if (graph.edges.length <= maxPreviewEdges) {
      return { edges: graph.edges, indexes: graph.edges.map((_, index) => index), subset: null };
    }
    const indexes = evenlySampleIndexes(graph.edges.length, maxPreviewEdges);
    return {
      edges: indexes.map((index) => graph.edges[index]),
      indexes,
      subset: { drawn: indexes.length, total: graph.edges.length }
    };
  }

  edgeColorsForIndexes(indexes, settings) {
    const graph = this.state.graph;
    return indexes.map((edgeIndex) => {
      const edge = graph.edges[edgeIndex];
      if (settings.edgeColorMode === 'source') return this.state.nodeColors[edge.sourceIndex] || hexToColor(settings.edgeSingleColor);
      return hexToColor(settings.edgeSingleColor);
    });
  }

  drawPreviewEdges() {
    const graph = this.state.graph;
    const positions = this.currentPositions();
    if (!graph || !positions.length) return;
    const previewSettings = {
      edgeColorMode: getEl('edgeColorMode').value,
      edgeSingleColor: getEl('edgeSingleColor').value,
      edgeOpacity: Math.min(0.4, Math.max(0.08, Number(getEl('edgeOpacity').value) || 0.18))
    };
    const { edges, indexes } = this.previewEdgeSelection(positions, 'straight');
    const polylines = edges.map((edge) => [positions[edge.sourceIndex], positions[edge.targetIndex]]);
    const colors = this.edgeColorsForIndexes(indexes, previewSettings);
    this.edgeRenderer.drawPolylines({ polylines, colors, opacity: previewSettings.edgeOpacity });
    this.state.edgeLayer = { kind: 'preview', edgeIndexes: indexes };
    this.sceneController.render();
  }

  redrawCurrentEdgeAppearance() {
    const last = this.edgeRenderer.lastDraw;
    if (!last?.polylines?.length) {
      this.drawPreviewEdges();
      return;
    }
    const settings = this.collectEdgeSettings();
    const edgeIndexes = this.state.edgeLayer.edgeIndexes || [];
    const colors = edgeIndexes.length ? this.edgeColorsForIndexes(edgeIndexes, settings) : last.colors;
    this.edgeRenderer.drawPolylines({ polylines: last.polylines, colors, opacity: settings.edgeOpacity });
    this.sceneController.render();
  }

  async drawEdges() {
    const graph = this.state.graph;
    const positions = this.currentPositions();
    if (!graph || !positions.length) return;
    const settings = this.collectEdgeSettings();
    const selection = this.previewEdgeSelection(positions, settings.algorithm === 'straight' ? 'straight' : 'curved');
    const selectedEdges = selection.edges;
    const selectedIndexes = selection.indexes;
    const colors = this.edgeColorsForIndexes(selectedIndexes, settings);

    if (settings.algorithm === 'straight') {
      const polylines = selectedEdges.map((edge) => [positions[edge.sourceIndex], positions[edge.targetIndex]]);
      this.edgeRenderer.drawPolylines({ polylines, colors, opacity: settings.edgeOpacity });
      this.state.edgeLayer = { kind: 'custom', edgeIndexes: selectedIndexes };
      this.setStatus(selection.subset
        ? `Straight edges drawn for ${selection.subset.drawn.toLocaleString()} of ${selection.subset.total.toLocaleString()} edges to keep rendering responsive.`
        : 'Straight edges drawn.');
      this.sceneController.render();
      return;
    }

    this.showProgress(`Running ${settings.algorithm} edge bundling…`);
    if (this.bundleWorker) this.bundleWorker.terminate();
    this.bundleWorker = new Worker(new URL('./workers/bundleWorker.js', import.meta.url), { type: 'module' });

    this.bundleWorker.onmessage = (event) => {
      const { type, polylines, percent } = event.data;
      if (type === 'progress') return this.setProgress(percent);
      if (type === 'result') {
        this.hideProgress();
        this.bundleWorker?.terminate();
        this.bundleWorker = null;
        this.edgeRenderer.drawPolylines({ polylines, colors, opacity: settings.edgeOpacity });
        this.state.edgeLayer = { kind: 'custom', edgeIndexes: selectedIndexes };
        this.setStatus(selection.subset
          ? `Bundled ${selection.subset.drawn.toLocaleString()} of ${selection.subset.total.toLocaleString()} edges to keep rendering responsive.`
          : 'Edges drawn.');
        this.sceneController.render();
      }
    };

    this.bundleWorker.onerror = (error) => {
      console.error(error);
      this.hideProgress();
      this.bundleWorker?.terminate();
      this.bundleWorker = null;
      this.setStatus('Edge bundling failed.');
      alert('Edge bundling failed. Check the console for details.');
    };

    this.bundleWorker.postMessage({
      nodes: positions.map((pos, index) => ({ id: graph.nodes[index].id, x: pos.x, y: pos.y, z: pos.z })),
      edges: selectedEdges.map((edge) => ({ sourceIndex: edge.sourceIndex, targetIndex: edge.targetIndex })),
      algorithm: settings.algorithm,
      samples: settings.samples,
      hubCount: settings.hubCount,
      lift: settings.lift,
      detourCap: settings.detourCap,
      exponent: settings.exponent,
      excludeDirect: settings.excludeDirect,
      degree: [...graph.metrics.degree]
    });
  }

  handleSceneClick(event) {
    if (!this.nodeRenderer.mesh || !this.state.graph) return;
    const rect = this.dom.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.sceneController.camera);
    this.nodeRenderer.mesh.updateMatrixWorld(true);
    const hits = this.raycaster.intersectObject(this.nodeRenderer.mesh, false);
    const hit = hits.find((item) => Number.isInteger(item.instanceId) || Number.isInteger(item.index));
    const directIndex = Number.isInteger(hit?.instanceId) ? hit.instanceId : hit?.index;
    if (Number.isInteger(directIndex)) {
      this.showSelectedNode(directIndex);
      return;
    }

    const positions = this.currentPositions();
    let bestIndex = -1;
    let bestDist2 = Infinity;
    const cameraPos = this.sceneController.camera.position;
    for (let i = 0; i < positions.length; i += 1) {
      const pos = positions[i];
      const world = new THREE.Vector3(pos.x, pos.y, pos.z || 0);
      const projected = world.clone().project(this.sceneController.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const sx = (projected.x * 0.5 + 0.5) * rect.width;
      const sy = (-projected.y * 0.5 + 0.5) * rect.height;
      const dx = (event.clientX - rect.left) - sx;
      const dy = (event.clientY - rect.top) - sy;
      const d2 = dx * dx + dy * dy;
      const worldDist = Math.max(1e-6, world.distanceTo(cameraPos));
      const perspectiveBoost = Math.min(3.2, 240 / worldDist);
      const pickRadius = Math.max(24, (this.state.nodeSizes[i] || 1) * 8 * perspectiveBoost);
      if (d2 <= pickRadius * pickRadius && d2 < bestDist2) {
        bestDist2 = d2;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestDist2 <= (54 * 54)) this.showSelectedNode(bestIndex);
    else this.hideSelectedNode();
  }

  showSelectedNode(index) {
    this.state.selectedNodeIndex = index;
    const graph = this.state.graph;
    const node = graph.nodes[index];
    const position = this.currentPositions()[index];
    const attrs = Object.entries(node.attrs || {});
    const fields = [
      ['ID', node.id],
      ['Label', node.label],
      ['Degree', graph.metrics.degree[index]],
      ['Weighted degree', Number(graph.metrics.weightedDegree[index]).toFixed(3)],
      ['Position', `x=${Number(position.x).toFixed(2)}, y=${Number(position.y).toFixed(2)}, z=${Number(position.z || 0).toFixed(2)}`],
      ['Original color', this.getOriginalNodeColor(node) || '—'],
      ['Rendered color', `#${(this.state.nodeColors[index]?.getHexString?.() || '—')}`],
      ['Color swatch', `<span class="color-chip" style="background:#${(this.state.nodeColors[index]?.getHexString?.() || '69a6ff')}"></span>`]
    ];
    const attrsHtml = attrs.length
      ? attrs.map(([key, value]) => `<div class="key">${escapeHtml(key)}</div><div class="value">${escapeHtml(value)}</div>`).join('')
      : '<div class="value">No custom attributes.</div>';

    this.dom.nodeInfoContent.innerHTML = `
      <div class="node-info-card">
        <div class="node-info-grid">
          ${fields.map(([key, value]) => `<div class="key">${escapeHtml(key)}</div><div class="value">${key === 'Color swatch' ? value : escapeHtml(value)}</div>`).join('')}
        </div>
      </div>
      <div class="node-info-card">
        <strong>Attributes</strong>
        <div class="node-info-grid" style="margin-top:8px;">
          ${attrsHtml}
        </div>
      </div>
    `;
    this.dom.nodeInfoPanel.classList.remove('hidden');
    this.setStatus(`Selected node: ${node.label || node.id}`);
  }

  hideSelectedNode() {
    this.state.selectedNodeIndex = null;
    this.dom.nodeInfoPanel.classList.add('hidden');
    this.dom.nodeInfoContent.innerHTML = '';
  }

  exportPng() {
    const { scale, transparent } = this.getExportOptions();
    const dataUrl = this.sceneController.exportPng({ scale, transparent });
    downloadDataUrl(dataUrl, 'network3d-studio.png');
  }

  exportSvg() {
    const positions = this.currentPositions();
    if (!positions.length) return;
    const { scale, transparent } = this.getExportOptions();
    const size = this.sceneController.getViewportSize();
    const svg = buildSceneSvg({
      camera: this.sceneController.camera,
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
      background: getEl('backgroundColor').value,
      transparent,
      positions,
      sizes: this.state.nodeSizes,
      nodeColors: this.state.nodeColors,
      polylines: this.edgeRenderer.lastDraw.polylines,
      edgeColors: this.edgeRenderer.lastDraw.colors,
      edgeOpacity: this.edgeRenderer.lastDraw.opacity,
      labels: getEl('showLabels').checked ? this.labelRenderer.exportLabels(this.state.graph.nodes, positions) : []
    });
    downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), 'network3d-studio.svg');
  }

  async exportPdf() {
    const { scale, transparent } = this.getExportOptions();
    const size = this.sceneController.getViewportSize();
    const dataUrl = this.sceneController.exportPng({ scale, transparent });
    const { jsPDF } = await import('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm');
    const pdf = new jsPDF({
      orientation: size.width >= size.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [size.width * scale, size.height * scale]
    });
    pdf.addImage(dataUrl, 'PNG', 0, 0, size.width * scale, size.height * scale, undefined, 'FAST');
    pdf.save('network3d-studio.pdf');
  }

  resetScene() {
    this.edgeRenderer.clear();
    this.nodeRenderer.dispose();
    this.labelRenderer.clear();
    this.hideSelectedNode();
    this.sceneController.fitToPositions([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 80 }]);
    this.setStatus('Scene reset. Graph data is still loaded.');
  }
}
