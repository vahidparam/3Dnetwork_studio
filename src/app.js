import * as THREE from 'three';
import { loadGraphFromFiles, buildGraph } from './graph.js';
import { SceneController } from './render/scene.js';
import { NodeRenderer } from './render/nodes.points.js';
import { EdgeRenderer } from './render/edges.js';
import { LabelRenderer } from './render/labels.js';
import { categoricalColor, colorLuminance, ensureContrast, hexToColor, numericRamp, parseLiteralColor, boostVisibility } from './utils/colors.js';
import { evenlySampleIndexes } from './utils/math.js';
import { buildSceneSvg } from './utils/export.js';

function getEl(id) {
  return document.getElementById(id);
}

function setOptions(select, values, { includeBlank = false, blankLabel = '—' } = {}) {
  select.innerHTML = '';
  if (includeBlank) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = blankLabel;
    select.appendChild(option);
  }
  if (!values.length && !includeBlank) {
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

function colorToCss(color) {
  return `#${color.getHexString()}`;
}

function mixColors(a, b, t = 0.5) {
  return new THREE.Color(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t
  );
}

function clonePositions(arr) {
  return arr.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
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
      nodeColorMeta: null,
      nodeSizeMeta: null,
      stage: 1,
      activeView: '2d',
      selectedNodeIndex: null,
      hoveredNodeIndex: null,
      edgeLayer: { kind: 'preview', edgeIndexes: [] },
      pinnedNodes: new Set(),
      pinnedBasePositions: new Array(),
      visibleMask: [],
      dragState: null,
      hoverPosition: { x: 0, y: 0 },
      screenNodeCache: []
    };
    this.suppressClick = false;

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
      showViewPanelBtn: getEl('showViewPanelBtn'),
      legendPanel: getEl('legendPanel'),
      legendContent: getEl('legendContent'),
      tooltip: getEl('tooltip'),
      helpModal: getEl('helpModal'),
      helpModalTitle: getEl('helpModalTitle'),
      helpModalBody: getEl('helpModalBody')
    };

    this.sceneController = new SceneController({
      canvas: this.dom.canvas,
      onRender: (camera) => {
        this.projectLabels(camera);
        this.updateScreenNodeCache(camera);
      }
    });
    this.nodeRenderer = new NodeRenderer(this.sceneController.scene);
    this.edgeRenderer = new EdgeRenderer(this.sceneController.scene);
    this.labelRenderer = new LabelRenderer(this.dom.labelsLayer);
    this.layoutWorker = null;
    this.bundleWorker = null;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 18;
    this.pointer = new THREE.Vector2();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.dragHit = new THREE.Vector3();
    this.presetStorageKey = 'network3d-studio-presets-v3';

    this.bundleModeInfo = {
      straight: 'Straight mode draws direct links only. Use it for inspection, debugging, and very large graphs.',
      arc: 'Arc mode adds a single lifted control point. Increase Lift for more separation; keep Samples moderate for performance.',
      hub: 'Hub bundle routes links through high-degree hubs. Increase Hub count when the graph has multiple communities; reduce it when the result becomes noisy.',
      legacy: 'Shortest-path legacy searches for an alternate route through the graph itself. Lower Path exponent prefers shorter local steps; lower Detour cap keeps routes tighter.'
    };

    this.helpContent = {
      overall: {
        title: 'Network3D Studio guide',
        body: `
          <h3>Recommended workflow</h3>
          <p>Start in <strong>Input</strong>, refine the network in <strong>2D Layout</strong>, add depth in <strong>3D Mapping</strong>, then draw or bundle edges in <strong>Edge Bundling</strong>.</p>
          <ul>
            <li><strong>Selection:</strong> use <strong>Ctrl + click</strong> on Windows/Linux or <strong>⌘ + click</strong> on macOS.</li>
            <li><strong>Drag editing:</strong> in 2D, drag nodes directly to reposition them. Those moved positions are preserved in later layout runs.</li>
            <li><strong>View panel:</strong> use the right panel for scene controls, export, edge opacity, and reset actions.</li>
            <li><strong>Performance:</strong> reduce point budget, edge opacity, or bundling samples when large graphs feel heavy.</li>
          </ul>
          <p>Use the small help buttons inside each section whenever you want tuning advice for a specific control group.</p>
        `
      },
      input: {
        title: 'Input formats',
        body: `
          <h3>Supported files</h3>
          <p>Load either one GEXF file or a pair of CSV files for nodes and edges. Use GEXF when you want to preserve positions, sizes, colors, and extra attributes from Gephi or another network tool.</p>
          <ul>
            <li><strong>GEXF:</strong> best choice when the graph already contains layout, size, color, or metadata.</li>
            <li><strong>Nodes CSV:</strong> should include <code>id</code>, and may include <code>label</code>, <code>x</code>, <code>y</code>, <code>z</code>, <code>size</code>, and <code>color</code>.</li>
            <li><strong>Edges CSV:</strong> should include <code>source</code> and <code>target</code>, with optional <code>weight</code>.</li>
            <li><strong>Header matching:</strong> CSV column names are case-insensitive, so capitalized Gephi exports like <code>ID</code>, <code>Source</code>, <code>Target</code>, <code>X</code>, and <code>Y</code> are accepted.</li>
            <li><strong>Duplicate edges:</strong> repeated source-target rows are accepted. The layout engine merges them internally for ForceAtlas2 stability.</li>
          </ul>
          <p>Use the × buttons to remove an uploaded file and clear the current scene before loading a different network.</p>
        `
      },
      layout2d: {
        title: '2D layout',
        body: `
          <h3>How to use this step</h3>
          <p>Start by choosing a position source. <strong>Existing positions</strong> uses coordinates already stored in the file. <strong>ForceAtlas2</strong> recomputes the layout and is usually the best option for exploratory work.</p>
          <ul>
            <li><strong>Scale X / Y:</strong> stretch or compress the layout horizontally or vertically without rerunning the layout.</li>
            <li><strong>Gravity:</strong> pulls disconnected pieces toward the center.</li>
            <li><strong>Repulsion / scaling:</strong> pushes nodes apart. Increase it when hubs overlap too much.</li>
            <li><strong>Barnes-Hut:</strong> speeds up ForceAtlas2 for large graphs.</li>
            <li><strong>Prevent node overlap:</strong> keeps large nodes from sitting on top of one another.</li>
          </ul>
          <p>Drag editing is enabled by default. To select a node, hold <strong>Ctrl</strong> or <strong>⌘</strong> and click.</p>
        `
      },
      appearance2d: {
        title: 'Node appearance',
        body: `
          <h3>Size and color</h3>
          <p>Use this section to map graph attributes into visible styling. Changes should appear immediately in 2D.</p>
          <ul>
            <li><strong>Node size mode:</strong> constant, degree-based, weighted degree, numeric attribute, or original imported size.</li>
            <li><strong>Node color mode:</strong> one single color, by attribute, or original imported colors.</li>
            <li><strong>Attribute color mode:</strong> automatically detects literal colors, numeric ramps, or categorical palettes.</li>
          </ul>
          <p>When a network has many edges, reduce edge opacity or move to the 3D step to inspect node colors more clearly.</p>
        `
      },
      mapping3d: {
        title: '3D mapping',
        body: `
          <h3>Depth strategies</h3>
          <p>This step keeps your 2D layout and adds a third dimension. Numeric attributes become continuous depth. Categorical attributes become discrete layers.</p>
          <ul>
            <li><strong>Flat:</strong> keeps the graph in 2D.</li>
            <li><strong>Degree / weighted degree:</strong> moves important nodes away from the plane.</li>
            <li><strong>Attribute:</strong> works for both numeric and categorical fields.</li>
            <li><strong>Globe:</strong> wraps the current 2D layout around a sphere.</li>
          </ul>
          <p><strong>Z scale</strong> controls the amount of depth. <strong>Z jitter</strong> adds slight separation to reduce overlap.</p>
        `
      },
      bundling: {
        title: 'Edge drawing and bundling',
        body: `
          <h3>Choosing a technique</h3>
          <p>Use <strong>Straight</strong> for raw inspection and very large graphs. Curved modes improve readability but require more computation.</p>
          <ul>
            <li><strong>Arc:</strong> simple lifted curves.</li>
            <li><strong>Hub bundle:</strong> routes many edges through hub nodes.</li>
            <li><strong>Shortest-path legacy:</strong> tries to reuse the network topology itself for bundled routes.</li>
          </ul>
          <p>For large graphs, keep samples moderate and only increase the point budget when your machine stays responsive.</p>
        `
      },
      pointBudget: {
        title: 'Point budget',
        body: `
          <h3>What point budget means</h3>
          <p>Point budget is a performance guardrail for edge rendering. Curved edges are drawn as many line segments. The point budget limits how much geometry is sent to the browser at once.</p>
          <ul>
            <li><strong>Lower values:</strong> faster previews and safer performance on large networks.</li>
            <li><strong>Higher values:</strong> more edges and smoother curves, but heavier GPU and browser load.</li>
          </ul>
          <p>If the browser becomes slow, reduce point budget, curve samples, or opacity-heavy edge rendering.</p>
        `
      },
      edgeOpacity: {
        title: 'Edge opacity',
        body: `
          <h3>Controlling edge strength</h3>
          <p>Edge opacity determines how strongly links dominate the scene. Lower opacity is better when you want to inspect node colors and structure without the edge layer washing over everything.</p>
          <ul>
            <li><strong>Low opacity:</strong> better for dense graphs and node inspection.</li>
            <li><strong>Higher opacity:</strong> better for sparse graphs or when edge patterns are the main focus.</li>
          </ul>
          <p>Use this slider in the view panel for quick scene tuning without changing the bundling method itself.</p>
        `
      }
    };

    this.bindEvents();
    this.bindRangeValueMirrors();
    this.updateStageUI(1);
    this.updateBundlingUI();
    this.applyViewSettings();
  }

  bindEvents() {
    getEl('loadGraphBtn').addEventListener('click', () => this.handleLoadGraph());
    getEl('clearGexfFileBtn').addEventListener('click', () => this.clearFileAndScene('gexfFile'));
    getEl('clearNodesCsvFileBtn').addEventListener('click', () => this.clearFileAndScene('nodesCsvFile'));
    getEl('clearEdgesCsvFileBtn').addEventListener('click', () => this.clearFileAndScene('edgesCsvFile'));
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
        this.syncEdgeOpacityControls('stage');
        this.redrawCurrentEdgeAppearance();
      });
    });

    const viewEdgeOpacity = getEl('viewEdgeOpacity');
    if (viewEdgeOpacity) {
      viewEdgeOpacity.addEventListener('input', () => {
        this.syncEdgeOpacityControls('view');
        this.redrawCurrentEdgeAppearance();
      });
    }

    [...document.querySelectorAll('[data-help-key]')].forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.showHelp(button.dataset.helpKey);
      });
    });
    getEl('closeHelpModalBtn')?.addEventListener('click', () => this.hideHelp());
    this.dom.helpModal?.addEventListener('click', (event) => {
      if (event.target === this.dom.helpModal) this.hideHelp();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.hideHelp();
    });

    getEl('fitViewBtn').addEventListener('click', () => this.sceneController.fitToPositions(this.visiblePositions()));
    getEl('resetSceneBtn').addEventListener('click', () => this.resetScene());
    getEl('exportSceneBtn').addEventListener('click', () => this.exportScene());
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


    this.dom.canvas.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    window.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    window.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.dom.canvas.addEventListener('click', (event) => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      if (this.state.dragState && this.state.dragState.moved) return;
      this.handleSceneClick(event);
    });
    this.dom.canvas.addEventListener('mouseleave', () => {
      if (!this.state.dragState) this.setHoveredNode(null);
      this.hideTooltip();
    });
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
    this.syncEdgeOpacityControls('stage');
  }

  setStatus(text) { this.dom.statusText.textContent = text; }

  setStats() {
    const graph = this.state.graph;
    const visibleCount = this.state.visibleMask?.length ? this.state.visibleMask.filter(Boolean).length : 0;
    this.dom.statsText.textContent = graph
      ? `Nodes: ${graph.nodes.length.toLocaleString()} (${visibleCount.toLocaleString()} visible) · Edges: ${graph.edges.length.toLocaleString()}`
      : 'Nodes: 0 · Edges: 0';
  }

  isSelectionModifier(event) {
    return !!(event?.ctrlKey || event?.metaKey);
  }

  isDragEditEnabled() {
    const el = getEl('dragEditMode');
    return el ? el.checked : true;
  }

  isLegendEnabled() {
    const el = getEl('showLegend');
    return el ? el.checked : true;
  }

  showHelp(key) {
    const entry = this.helpContent[key];
    if (!entry || !this.dom.helpModal) return;
    this.dom.helpModalTitle.textContent = entry.title;
    this.dom.helpModalBody.innerHTML = entry.body;
    this.dom.helpModal.classList.remove('hidden');
  }

  hideHelp() {
    this.dom.helpModal?.classList.add('hidden');
  }

  syncEdgeOpacityControls(source = 'stage') {
    const stageInput = getEl('edgeOpacity');
    const viewInput = getEl('viewEdgeOpacity');
    const viewLabel = getEl('viewEdgeOpacityValue');
    if (!stageInput || !viewInput) return;
    if (source === 'view') stageInput.value = viewInput.value;
    else viewInput.value = stageInput.value;
    if (viewLabel) viewLabel.textContent = formatValue(stageInput.value, 2);
  }

  collapseStageSections(stage) {
    const panel = document.querySelector(`.stage-panel[data-stage="${stage}"]`);
    if (!panel) return;
    const details = [...panel.querySelectorAll('details.section-card')];
    if (!details.length) return;
    details.forEach((detail, index) => {
      detail.open = index === 0;
    });
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

  hideProgress() { this.dom.progressOverlay.classList.add('hidden'); }

  clearFileAndScene(inputId) {
    const input = getEl(inputId);
    if (input) input.value = '';
    this.clearLoadedGraph();
  }

  clearLoadedGraph() {
    this.state.graph = null;
    this.state.base2DPositions = [];
    this.state.positions2D = [];
    this.state.positions3D = [];
    this.state.nodeSizes = [];
    this.state.nodeColors = [];
    this.state.nodeColorMeta = null;
    this.state.nodeSizeMeta = null;
    this.state.activeView = '2d';
    this.state.selectedNodeIndex = null;
    this.state.hoveredNodeIndex = null;
    this.state.edgeLayer = { kind: 'preview', edgeIndexes: [] };
    this.state.pinnedNodes = new Set();
    this.state.pinnedBasePositions = [];
    this.state.visibleMask = [];
    this.state.screenNodeCache = [];
    this.nodeRenderer.dispose();
    this.edgeRenderer.clear();
    this.labelRenderer.clear();
    this.hideTooltip();
    this.dom.nodeInfoPanel.classList.add('hidden');
    this.dom.nodeInfoContent.innerHTML = '';
    this.enableStage(2, false);
    this.enableStage(3, false);
    this.enableStage(4, false);
    this.updateStageUI(1);
    this.setStats();
    this.updateLegend();
    this.sceneController.fitToPositions([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 80 }]);
    this.setStatus('Scene cleared. Load a graph to begin.');
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

  getAllPresetIds() {
    return [
      'positionSource', 'layoutIterations', 'scaleX', 'scaleY', 'layoutGravity', 'layoutRepulsion',
      'fa2BarnesHut', 'fa2AdjustSizes', 'fa2Outbound', 'fa2LinLog',
      'nodeSizeMode', 'nodeSizeAttribute', 'nodeSizeMin', 'nodeSizeMax', 'nodeSizeScale',
      'nodeColorMode', 'nodeColorAttribute', 'nodeSingleColor', 'nodeRampColor',
      'zMode', 'zAttribute', 'zScale', 'zJitter', 'zCategoryGap',
      'edgeMode', 'edgeColorMode', 'edgeSingleColor', 'edgeOpacity', 'bundleSamples', 'bundleHubCount', 'bundleLift', 'bundleDetour', 'legacyExponent', 'legacyExcludeDirect',
      'backgroundColor', 'nodeDetail', 'showLabels', 'labelCount', 'labelSize', 'pointBudget', 'exportScale', 'transparentExport'
    ];
  }

  readCurrentPreset() {
    const controls = {};
    for (const id of this.getAllPresetIds()) {
      const el = getEl(id);
      if (!el) continue;
      controls[id] = el.type === 'checkbox' ? el.checked : el.value;
    }
    return {
      controls,
      pinnedNodes: Array.from(this.state.pinnedNodes),
      pinnedBasePositions: this.state.pinnedBasePositions,
      camera: {
        position: this.sceneController.camera.position.toArray(),
        target: this.sceneController.controls.target.toArray()
      }
    };
  }

  applyPresetControls(preset) {
    if (!preset) return;
    for (const [id, value] of Object.entries(preset.controls || {})) {
      const el = getEl(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!value;
      else el.value = value;
    }
    this.state.pinnedNodes = new Set((preset.pinnedNodes || []).map((v) => Number(v)));
    this.state.pinnedBasePositions = preset.pinnedBasePositions || [];
    if (preset.camera?.position && preset.camera?.target) {
      this.sceneController.camera.position.fromArray(preset.camera.position);
      this.sceneController.controls.target.fromArray(preset.camera.target);
      this.sceneController.render();
    }
  }

  getSavedPresets() {
    try {
      return JSON.parse(localStorage.getItem(this.presetStorageKey) || '{}');
    } catch {
      return {};
    }
  }

  savePreset() {
    const name = (getEl('presetName').value || '').trim();
    if (!name) {
      alert('Enter a preset name first.');
      return;
    }
    const presets = this.getSavedPresets();
    presets[name] = this.readCurrentPreset();
    localStorage.setItem(this.presetStorageKey, JSON.stringify(presets));
    this.refreshPresetMenu(name);
    this.setStatus(`Preset saved: ${name}`);
  }

  async loadPreset() {
    const name = getEl('presetSelect').value;
    if (!name) return;
    const preset = this.getSavedPresets()[name];
    if (!preset) return;
    this.applyPresetControls(preset);
    this.applyViewSettings();
    if (this.state.graph) {
      await this.run2D(false);
      if (this.state.positions3D.length || getEl('zMode').value !== 'flat') await this.run3D(false);
      if (this.state.edgeLayer.kind === 'custom') this.redrawCurrentEdgeAppearance();
    }
    this.setStatus(`Preset loaded: ${name}`);
  }

  deletePreset() {
    const name = getEl('presetSelect').value;
    if (!name) return;
    const presets = this.getSavedPresets();
    delete presets[name];
    localStorage.setItem(this.presetStorageKey, JSON.stringify(presets));
    this.setStatus(`Preset deleted: ${name}`);
  }

  refreshPresetMenu(selectName = '') {
    const presets = this.getSavedPresets();
    const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
    setOptions(getEl('presetSelect'), names, { includeBlank: true, blankLabel: '— none —' });
    if (selectName && names.includes(selectName)) getEl('presetSelect').value = selectName;
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
        && originalStats.darkRatio < 0.7
        && originalStats.avgLuminance > 0.18) {
        return { mode: 'original' };
      }
    }

    let bestLiteralAttr = null;
    let bestCategoricalAttr = null;
    let bestNumericAttr = null;
    let bestCategoricalScore = -Infinity;
    let bestNumericScore = -Infinity;

    allAttrs.forEach((attr) => {
      const values = graph.nodes.map((node) => this.getNodeAttrValue(node, attr)).filter((value) => value != null && String(value).trim() !== '');
      if (!values.length) return;

      const literalStats = colorStats(values.map((value) => parseLiteralColor(value)));
      if (literalStats.validCount / values.length > 0.6 && literalStats.uniqueCount >= 3 && literalStats.darkRatio < 0.8) {
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
    if (!gexfFile && !(nodesCsvFile && edgesCsvFile)) {
      this.setStatus('Choose one GEXF file, or both nodes and edges CSV files.');
      return;
    }
    try {
      this.showProgress('Loading graph…');
      this.setStatus(nodesCsvFile && edgesCsvFile ? 'Loading CSV graph…' : 'Loading graph…');
      const rawGraph = await loadGraphFromFiles({
        gexfFile,
        nodesCsvFile,
        edgesCsvFile,
        onPhase: (title) => { this.dom.progressTitle.textContent = title; },
        onProgress: (percent) => this.setProgress(percent)
      });
      this.dom.progressTitle.textContent = 'Building graph…';
      this.setProgress(100);
      this.state.graph = buildGraph(rawGraph);
      this.state.base2DPositions = [];
      this.state.positions2D = [];
      this.state.positions3D = [];
      this.state.nodeSizes = [];
      this.state.nodeColors = [];
      this.state.nodeColorMeta = null;
      this.state.nodeSizeMeta = null;
      this.state.activeView = '2d';
      this.state.selectedNodeIndex = null;
      this.state.hoveredNodeIndex = null;
      this.state.edgeLayer = { kind: 'preview', edgeIndexes: [] };
      this.state.pinnedNodes = new Set();
      this.state.pinnedBasePositions = new Array(this.state.graph.nodes.length).fill(null);
      this.state.visibleMask = new Array(this.state.graph.nodes.length).fill(true);
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
      this.collapseStageSections(2);
      this.hideProgress();
      this.setStatus(nodesCsvFile && edgesCsvFile ? 'CSV graph loaded. Adjust the 2D layout.' : 'Graph loaded. Adjust the 2D layout.');
    } catch (error) {
      console.error(error);
      this.hideProgress();
      const message = error?.message || 'Failed to load graph.';
      this.setStatus(message);
      alert(message);
    }
  }

  populateAttributeMenus() {
    const graph = this.state.graph;
    const colorAttributes = [...graph.attributes.nodeAll];
    if (!colorAttributes.includes('color')) colorAttributes.unshift('color');
    const zAttributes = [...graph.attributes.nodeAll];
    if (!zAttributes.includes('size') && graph.attributes.nodeNumeric.includes('size')) zAttributes.unshift('size');
    setOptions(getEl('nodeSizeAttribute'), graph.attributes.nodeNumeric, { includeBlank: true, blankLabel: '— none —' });
    setOptions(getEl('nodeColorAttribute'), colorAttributes, { includeBlank: true, blankLabel: '— auto —' });
    setOptions(getEl('zAttribute'), zAttributes, { includeBlank: true, blankLabel: '— none —' });

    if (colorAttributes.length) getEl('nodeColorAttribute').value = colorAttributes[0];
    if (zAttributes.length) getEl('zAttribute').value = zAttributes[0];
    if (!graph.attributes.nodeNumeric.length) {
      getEl('nodeSizeMode').value = 'degree';
      getEl('zMode').value = graph.flags.hasZPositions ? 'original' : 'degree';
    }

  }

  renderCategoryFilterValues() {
    return;
  }

  applyFilters() {
    if (this.state.graph) {
      this.state.visibleMask = new Array(this.state.graph.nodes.length).fill(true);
      this.setStats();
      this.renderCurrentView(true);
      this.updateLegend();
    }
  }

  resetFilters() {
    this.applyFilters();
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

  mapPositionsToGlobe(base2D, radius) {
    if (!base2D.length) return [];
    const xs = base2D.map((p) => p.x || 0);
    const ys = base2D.map((p) => p.y || 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1e-6, maxX - minX);
    const spanY = Math.max(1e-6, maxY - minY);
    const r = Math.max(10, radius);

    return base2D.map((pos) => {
      const u = ((pos.x || 0) - minX) / spanX;
      const v = ((pos.y || 0) - minY) / spanY;
      const lon = (u - 0.5) * Math.PI * 2.0;
      const lat = (0.5 - v) * Math.PI;
      const cosLat = Math.cos(lat);
      return {
        x: r * cosLat * Math.cos(lon),
        y: r * Math.sin(lat),
        z: r * cosLat * Math.sin(lon)
      };
    });
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
    if (!this.state.positions3D.length) this.sceneController.fitToPositions(this.visiblePositions('2d'));
    this.setStatus(finalize ? '2D layout finalized. Map the graph into 3D.' : '2D layout applied.');
    if (finalize) this.updateStageUI(3);
  }

  async compute2DLayout(settings) {
    const graph = this.state.graph;
    if (settings.positionSource !== 'forceatlas2') {
      const positions = this.computeFast2DLayout(settings.positionSource, graph);
      return positions.map((p, index) => this.state.pinnedNodes.has(index) && this.state.pinnedBasePositions[index] ? { ...this.state.pinnedBasePositions[index] } : p);
    }

    this.showProgress('Computing ForceAtlas2 layout…');
    if (this.layoutWorker) this.layoutWorker.terminate();
    this.layoutWorker = new Worker(new URL('./workers/layoutWorker.js', import.meta.url), { type: 'module' });
    const pinned = Array.from(this.state.pinnedNodes).map((index) => ({ index, x: this.state.pinnedBasePositions[index]?.x ?? this.state.base2DPositions[index]?.x ?? 0, y: this.state.pinnedBasePositions[index]?.y ?? this.state.base2DPositions[index]?.y ?? 0 }));

    return new Promise((resolve, reject) => {
      this.layoutWorker.onmessage = (event) => {
        const { type, positions, percent, message } = event.data;
        if (type === 'progress') return this.setProgress(percent);
        if (type === 'error') {
          this.hideProgress();
          this.layoutWorker?.terminate();
          this.layoutWorker = null;
          reject(new Error(message || 'ForceAtlas2 failed.'));
          return;
        }
        if (type === 'result') {
          this.hideProgress();
          this.layoutWorker.terminate();
          this.layoutWorker = null;
          resolve(positions.map((p, index) => this.state.pinnedNodes.has(index) && this.state.pinnedBasePositions[index] ? { ...this.state.pinnedBasePositions[index] } : p));
        }
      };
      this.layoutWorker.onerror = (error) => {
        this.hideProgress();
        this.layoutWorker?.terminate();
        this.layoutWorker = null;
        reject(error);
      };
      this.layoutWorker.postMessage({
        nodes: graph.nodes.map((node) => ({ x: node.x, y: node.y, size: node.size })),
        edges: graph.edges.map((edge) => ({ sourceIndex: edge.sourceIndex, targetIndex: edge.targetIndex, weight: edge.weight })),
        iterations: settings.iterations,
        gravity: settings.gravity,
        repulsion: settings.repulsion,
        barnesHutOptimize: settings.fa2BarnesHut,
        adjustSizes: settings.fa2AdjustSizes,
        outboundAttractionDistribution: settings.fa2Outbound,
        linLogMode: settings.fa2LinLog,
        pinned
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
    this.state.positions2D = this.state.base2DPositions.map((p, index) => {
      const base = this.state.pinnedNodes.has(index) && this.state.pinnedBasePositions[index] ? this.state.pinnedBasePositions[index] : p;
      return { x: base.x * settings.scaleX, y: base.y * settings.scaleY, z: 0 };
    });
    this.computeNodeEncodings(settings);
    if (this.state.activeView === '2d' || !this.state.positions3D.length) this.renderCurrentView();
    else this.run3D(false);
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
    this.state.nodeSizeMeta = { mode: settings.nodeSizeMode, min: minValue, max: maxValue, attribute: settings.nodeSizeAttribute };

    const background = hexToColor(getEl('backgroundColor').value);
    let numericRange = null;
    let literalColorRatio = 0;
    let categoricalCount = 0;
    let categoryMap = null;
    let colorMeta = { mode: settings.nodeColorMode };

    if (settings.nodeColorMode === 'attribute') {
      const values = graph.nodes.map((node) => this.getNodeAttrValue(node, settings.nodeColorAttribute));
      const numericValues = values.map((value) => this.coerceNumeric(value)).filter((value) => Number.isFinite(value));
      const parsedLiteralColors = values.map((value) => parseLiteralColor(value));
      literalColorRatio = parsedLiteralColors.filter(Boolean).length / Math.max(1, values.length);
      categoricalCount = new Set(values.filter((value) => value != null && String(value).trim() !== '').map((value) => String(value))).size;
      if (numericValues.length && literalColorRatio < 0.5) {
        numericRange = { min: Math.min(...numericValues), max: Math.max(...numericValues) };
        colorMeta = { mode: 'numeric', attribute: settings.nodeColorAttribute, ...numericRange, start: settings.nodeSingleColor, end: settings.nodeRampColor };
      } else if (literalColorRatio > 0.6) {
        colorMeta = { mode: 'literal', attribute: settings.nodeColorAttribute };
      } else {
        categoryMap = new Map();
        colorMeta = { mode: 'categorical', attribute: settings.nodeColorAttribute, categories: categoryMap };
      }
      if (literalColorRatio > 0.6) getEl('nodeColorHint').textContent = 'The selected attribute contains explicit colors. They are now used directly.';
      else if (numericRange) getEl('nodeColorHint').textContent = 'The selected attribute is numeric. Nodes use a continuous color ramp.';
      else getEl('nodeColorHint').textContent = `The selected attribute is treated as categorical (${categoricalCount} categories detected).`;
    } else if (settings.nodeColorMode === 'original') {
      getEl('nodeColorHint').textContent = 'Using original node colors from the uploaded graph when available.';
      colorMeta = { mode: 'original' };
    } else {
      getEl('nodeColorHint').textContent = 'Single color mode applies one consistent color to all nodes.';
      colorMeta = { mode: 'single', color: settings.nodeSingleColor };
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
          if (categoryMap && !categoryMap.has(String(value))) categoryMap.set(String(value), color.clone());
        } else {
          color = parseLiteralColor(this.getOriginalNodeColor(node)) || hexToColor(settings.nodeSingleColor);
        }
      }
      color = ensureContrast(color, background, 0.12);
      if (colorLuminance(background) < 0.45) color = boostVisibility(color, 0.12);
      nodeColors[i] = color;
    }

    this.state.nodeSizes = nodeSizes;
    this.state.nodeColors = nodeColors;
    this.state.nodeColorMeta = colorMeta;
  }

  getCategoricalLayerMap(attrName) {
    const graph = this.state.graph;
    const values = graph.nodes.map((node) => this.getNodeAttrValue(node, attrName)).filter((value) => value != null && String(value).trim() !== '');
    const counts = new Map();
    values.forEach((value) => counts.set(String(value), (counts.get(String(value)) || 0) + 1));
    const ordered = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return new Map(ordered.map(([value], index) => [value, index]));
  }

  async run3D(finalize) {
    const graph = this.state.graph;
    if (!graph || !this.state.positions2D.length) return;
    const settings = this.collect3DSettings();
    const base2D = clonePositions(this.state.positions2D);
    let numericRange = null;
    let categoricalLayerMap = null;

    if (settings.zMode === 'attribute') {
      const rawValues = graph.nodes.map((node) => this.getNodeAttrValue(node, settings.zAttribute));
      const numericValues = rawValues.map((value) => this.coerceNumeric(value)).filter((value) => Number.isFinite(value));
      if (numericValues.length >= Math.max(3, Math.floor(graph.nodes.length * 0.5))) {
        numericRange = { min: Math.min(...numericValues), max: Math.max(...numericValues) };
      } else {
        categoricalLayerMap = this.getCategoricalLayerMap(settings.zAttribute);
      }
    }

    if (settings.zMode === 'globe') {
      this.state.positions3D = this.mapPositionsToGlobe(base2D, settings.zScale * 8);
      if (settings.zJitter > 0) {
        this.state.positions3D = this.state.positions3D.map((pos) => {
          const dir = new THREE.Vector3(pos.x, pos.y, pos.z).normalize();
          const delta = (Math.random() - 0.5) * settings.zJitter * 2;
          return { x: pos.x + dir.x * delta, y: pos.y + dir.y * delta, z: pos.z + dir.z * delta };
        });
      }
    } else {
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
    }

    this.state.activeView = '3d';
    this.renderCurrentView(true);
    this.sceneController.fitToPositions(this.visiblePositions('3d'));
    this.setStatus(finalize
      ? (settings.zMode === 'globe' ? 'Globe mapping finalized. Draw edges or run bundling.' : '3D mapping finalized. Draw edges or run bundling.')
      : (settings.zMode === 'globe' ? 'Globe mapping applied.' : '3D mapping applied.'));
    if (finalize) this.updateStageUI(4);
  }

  currentPositions() {
    if (this.state.activeView === '3d' && this.state.positions3D.length) return this.state.positions3D;
    if (this.state.positions2D.length) return this.state.positions2D;
    if (this.state.positions3D.length) return this.state.positions3D;
    return [];
  }

  visiblePositions(view = null) {
    const positions = view === '3d' ? this.state.positions3D : view === '2d' ? this.state.positions2D : this.currentPositions();
    if (!positions.length) return [];
    const mask = this.state.visibleMask?.length ? this.state.visibleMask : positions.map(() => true);
    const visible = positions.filter((_, i) => mask[i]);
    return visible.length ? visible : positions;
  }

  getFocusSet() {
    const graph = this.state.graph;
    const focus = new Set();
    if (!graph) return focus;
    const hover = this.state.hoveredNodeIndex;
    const selected = this.state.selectedNodeIndex;
    if (hover != null && hover >= 0) {
      focus.add(hover);
      for (const neighbor of graph.metrics.neighbors[hover] || []) focus.add(neighbor);
    }
    if (selected != null && selected >= 0) {
      focus.add(selected);
      for (const neighbor of graph.metrics.neighbors[selected] || []) focus.add(neighbor);
    }
    return focus;
  }

  displayedNodeColors() {
    const colors = this.state.nodeColors.map((color) => color.clone());
    const focus = this.getFocusSet();
    if (!focus.size) return colors;
    return colors.map((color, index) => focus.has(index) ? boostVisibility(color, 0.16) : color);
  }

  renderCurrentView(resetEdges = true) {
    this.renderNodes();
    if (resetEdges || this.state.edgeLayer.kind !== 'custom' || !this.edgeRenderer.lastDraw.polylines.length) this.drawPreviewEdges();
    else this.redrawCurrentEdgeAppearance();
    this.updateLegend();
    this.sceneController.render();
  }

  renderNodes() {
    const positions = this.currentPositions();
    if (!positions.length) return;
    const focus = this.getFocusSet();
    this.nodeRenderer.update({
      positions,
      sizes: this.state.nodeSizes.length ? this.state.nodeSizes : positions.map(() => 1),
      colors: this.displayedNodeColors(),
      detail: Number(getEl('nodeDetail').value),
      visibleMask: this.state.visibleMask,
      emphasisSet: focus,
      selectedIndex: this.state.selectedNodeIndex ?? -1,
      viewportHeight: this.sceneController.getViewportSize().height
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
    const focus = [];
    if (this.state.selectedNodeIndex != null) focus.push(this.state.selectedNodeIndex);
    if (this.state.hoveredNodeIndex != null) focus.push(this.state.hoveredNodeIndex);
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
      background: hexToColor(getEl('backgroundColor').value),
      visibleMask: this.state.visibleMask,
      focusIndexes: focus
    });
  }

  projectLabels(camera) {
    const positions = this.currentPositions();
    if (!positions.length) {
      this.state.screenNodeCache = [];
      return;
    }
    this.labelRenderer.project(positions, camera, this.dom.canvas.clientWidth, this.dom.canvas.clientHeight);
  }

  updateScreenNodeCache(camera = this.sceneController.camera) {
    const positions = this.currentPositions();
    if (!positions.length) {
      this.state.screenNodeCache = [];
      return;
    }
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const rect = this.dom.canvas.getBoundingClientRect();
    const width = rect.width || this.dom.canvas.clientWidth || 1;
    const height = rect.height || this.dom.canvas.clientHeight || 1;
    const temp = new THREE.Vector3();
    this.state.screenNodeCache = positions.map((p, i) => {
      temp.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0).project(camera);
      return {
        x: (temp.x * 0.5 + 0.5) * width,
        y: (-temp.y * 0.5 + 0.5) * height,
        z: temp.z,
        size: this.state.nodeSizes[i] || 1,
        visible: !this.state.visibleMask?.length || !!this.state.visibleMask[i]
      };
    });
  }

  updateLegend() {
    const visible = this.isLegendEnabled();
    this.dom.legendPanel.classList.toggle('hidden', !visible || !this.state.graph);
    if (!visible || !this.state.graph) return;

    const sections = [];
    const colorMeta = this.state.nodeColorMeta || { mode: 'single', color: getEl('nodeSingleColor').value };
    if (colorMeta.mode === 'single') {
      sections.push(`<div class="legend-section"><div class="legend-title">Node color</div><div class="legend-row"><span class="swatch" style="background:${escapeHtml(colorMeta.color || getEl('nodeSingleColor').value)}"></span><span>Single color</span></div></div>`);
    } else if (colorMeta.mode === 'numeric') {
      sections.push(`<div class="legend-section"><div class="legend-title">Node color · ${escapeHtml(colorMeta.attribute || '')}</div><div class="ramp" style="background:linear-gradient(90deg, ${escapeHtml(colorMeta.start)}, ${escapeHtml(colorMeta.end)})"></div><div class="ramp-labels"><span>${formatValue(colorMeta.min ?? 0, 2)}</span><span>${formatValue(colorMeta.max ?? 1, 2)}</span></div></div>`);
    } else if (colorMeta.mode === 'categorical') {
      const rows = Array.from(colorMeta.categories?.entries?.() || []).slice(0, 10).map(([label, color]) => `<div class="legend-row"><span class="swatch" style="background:${colorToCss(color)}"></span><span title="${escapeHtml(label)}">${escapeHtml(label)}</span></div>`).join('');
      sections.push(`<div class="legend-section"><div class="legend-title">Node color · ${escapeHtml(colorMeta.attribute || '')}</div>${rows || '<div class="hint subtle">Category colors will appear after rendering.</div>'}</div>`);
    } else if (colorMeta.mode === 'literal' || colorMeta.mode === 'original') {
      const seen = new Set();
      const sampleRows = [];
      for (const c of (this.state.nodeColors || []).filter(Boolean)) {
        const hex = `#${(c?.getHexString ? c.getHexString() : hexToColor(c).getHexString())}`;
        if (seen.has(hex)) continue;
        seen.add(hex);
        sampleRows.push(`<div class="legend-row"><span class="swatch" style="background:${hex}"></span><span>${hex}</span></div>`);
        if (sampleRows.length >= 8) break;
      }
      const fallbackText = colorMeta.mode === 'original' ? 'Using original colors stored in the graph.' : 'Using literal colors stored in the selected attribute.';
      sections.push(`<div class="legend-section"><div class="legend-title">Node color</div>${sampleRows.join('') || `<div class="hint subtle">${fallbackText}</div>`}</div>`);
    }

    const sizeMeta = this.state.nodeSizeMeta;
    if (sizeMeta) {
      const sizes = [0.7, 1.2, 1.8].map((s) => `<span class="size-dot" style="width:${12 * s}px;height:${12 * s}px"></span>`).join('');
      const title = sizeMeta.mode === 'attribute' ? `Node size · ${escapeHtml(sizeMeta.attribute || '')}` : `Node size · ${escapeHtml(sizeMeta.mode)}`;
      const minText = Number.isFinite(sizeMeta.min) ? formatValue(sizeMeta.min, 2) : 'low';
      const maxText = Number.isFinite(sizeMeta.max) ? formatValue(sizeMeta.max, 2) : 'high';
      sections.push(`<div class="legend-section"><div class="legend-title">${title}</div><div class="size-dots">${sizes}</div><div class="ramp-labels"><span>${minText}</span><span>${maxText}</span></div></div>`);
    }

    const visibleCount = this.state.visibleMask?.filter(Boolean).length || this.state.graph.nodes.length;
    sections.push(`<div class="legend-section"><div class="legend-title">Scene</div><div class="legend-row"><span>${visibleCount.toLocaleString()} visible nodes</span></div></div>`);
    this.dom.legendContent.innerHTML = sections.join('');
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
    this.updateLegend();
  }

  visibleEdgeIndexes() {
    const graph = this.state.graph;
    const mask = this.state.visibleMask?.length ? this.state.visibleMask : null;
    if (!graph) return [];
    if (!mask) return graph.edges.map((_, index) => index);
    const indexes = [];
    for (let i = 0; i < graph.edges.length; i += 1) {
      const edge = graph.edges[i];
      if (mask[edge.sourceIndex] && mask[edge.targetIndex]) indexes.push(i);
    }
    return indexes;
  }

  previewEdgeSelection(positions, algorithm = 'straight') {
    const graph = this.state.graph;
    if (!graph || !positions.length) return { edges: [], indexes: [], subset: null };
    const pointBudget = Math.max(2000, Number(getEl('pointBudget').value) || 300000);
    const samples = Math.max(2, Number(getEl('bundleSamples').value) || 8);
    const multiplier = algorithm === 'straight' ? 2 : Math.max(4, samples * 2);
    const maxPreviewEdges = Math.max(120, Math.floor(pointBudget / multiplier));
    const visibleIndexes = this.visibleEdgeIndexes();
    if (visibleIndexes.length <= maxPreviewEdges) {
      return { edges: visibleIndexes.map((index) => graph.edges[index]), indexes: visibleIndexes, subset: null };
    }
    const sampleIndexes = evenlySampleIndexes(visibleIndexes.length, maxPreviewEdges).map((index) => visibleIndexes[index]);
    return {
      edges: sampleIndexes.map((index) => graph.edges[index]),
      indexes: sampleIndexes,
      subset: { drawn: sampleIndexes.length, total: visibleIndexes.length }
    };
  }

  edgeColorsForIndexes(indexes, settings) {
    const graph = this.state.graph;
    const bg = hexToColor(getEl('backgroundColor').value);
    const focus = this.getFocusSet();
    return indexes.map((edgeIndex) => {
      const edge = graph.edges[edgeIndex];
      let color = settings.edgeColorMode === 'source' ? (this.state.nodeColors[edge.sourceIndex] || hexToColor(settings.edgeSingleColor)) : hexToColor(settings.edgeSingleColor);
      if (focus.size && !focus.has(edge.sourceIndex) && !focus.has(edge.targetIndex)) color = mixColors(color, bg, 0.76);
      return color;
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
      this.setStatus(selection.subset ? `Straight edges drawn for ${selection.subset.drawn.toLocaleString()} of ${selection.subset.total.toLocaleString()} visible edges.` : 'Straight edges drawn.');
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
        this.setStatus(selection.subset ? `Bundled ${selection.subset.drawn.toLocaleString()} of ${selection.subset.total.toLocaleString()} visible edges.` : 'Edges drawn.');
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

  normalizedPointerFromEvent(event) {
    const rect = this.dom.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return rect;
  }

  pickNodeIndexFromEvent(event) {
    if (!this.state.graph) return -1;
    const rect = this.normalizedPointerFromEvent(event);
    const camera = this.sceneController.camera;
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();

    const cache = this.state.screenNodeCache?.length ? this.state.screenNodeCache : null;
    const positions = this.currentPositions();
    let bestIndex = -1;
    let bestDist2 = Infinity;

    const temp = new THREE.Vector3();
    for (let i = 0; i < positions.length; i += 1) {
      if (this.state.visibleMask?.length && !this.state.visibleMask[i]) continue;
      const entry = cache ? cache[i] : null;
      let sx;
      let sy;
      let sz;
      let renderedSize;

      if (entry) {
        sx = entry.x;
        sy = entry.y;
        sz = entry.z;
        renderedSize = entry.size;
      } else {
        const p = positions[i] || { x: 0, y: 0, z: 0 };
        temp.set(Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0).project(camera);
        sx = (temp.x * 0.5 + 0.5) * rect.width;
        sy = (-temp.y * 0.5 + 0.5) * rect.height;
        sz = temp.z;
        renderedSize = this.state.nodeSizes[i] || 1;
      }

      if (sz < -1 || sz > 1) continue;
      const dx = (event.clientX - rect.left) - sx;
      const dy = (event.clientY - rect.top) - sy;
      const d2 = dx * dx + dy * dy;
      const pickRadius = Math.max(12, renderedSize * 4.2 + 7);
      if (d2 <= pickRadius * pickRadius && d2 < bestDist2) {
        bestDist2 = d2;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  handlePointerDown(event) {
    const picked = this.pickNodeIndexFromEvent(event);
    const canDrag = this.state.activeView === '2d' && this.isDragEditEnabled() && !this.isSelectionModifier(event);
    if (canDrag && picked >= 0 && event.button === 0) {
      const current = this.state.positions2D[picked];
      if (!current) return;
      this.normalizedPointerFromEvent(event);
      this.raycaster.setFromCamera(this.pointer, this.sceneController.camera);
      this.dragPlane.constant = -(current.z || 0);
      this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHit);
      this.state.dragState = {
        nodeIndex: picked,
        offsetX: current.x - this.dragHit.x,
        offsetY: current.y - this.dragHit.y,
        moved: false
      };
      this.sceneController.controls.enabled = false;
      event.preventDefault();
      return;
    }
    this.state.dragState = { pointerOnly: true, moved: false, x: event.clientX, y: event.clientY };
  }

  handlePointerMove(event) {
    if (this.state.dragState && !this.state.dragState.pointerOnly) {
      this.normalizedPointerFromEvent(event);
      this.raycaster.setFromCamera(this.pointer, this.sceneController.camera);
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHit)) {
        const index = this.state.dragState.nodeIndex;
        const newPos = {
          x: this.dragHit.x + this.state.dragState.offsetX,
          y: this.dragHit.y + this.state.dragState.offsetY,
          z: 0
        };
        this.state.positions2D[index] = newPos;
        const scaleX = Number(getEl('scaleX').value) || 1;
        const scaleY = Number(getEl('scaleY').value) || 1;
        this.state.base2DPositions[index] = { x: newPos.x / scaleX, y: newPos.y / scaleY };
        this.state.pinnedBasePositions[index] = { ...this.state.base2DPositions[index] };
        this.state.pinnedNodes.add(index);
        if (this.state.positions3D[index]) {
          this.state.positions3D[index].x = newPos.x;
          this.state.positions3D[index].y = newPos.y;
        }
        this.state.dragState.moved = true;
        this.renderCurrentView(true);
        this.setStatus(`Dragging node ${this.state.graph.nodes[index].label || this.state.graph.nodes[index].id}.`);
      }
      return;
    }

    if (this.state.dragState?.pointerOnly) {
      const moved = Math.hypot((event.clientX - this.state.dragState.x), (event.clientY - this.state.dragState.y));
      if (moved > 4) this.state.dragState.moved = true;
    }

    const idx = this.pickNodeIndexFromEvent(event);
    this.state.hoverPosition = { x: event.clientX, y: event.clientY };
    this.setHoveredNode(idx >= 0 ? idx : null);
  }

  handlePointerUp(event) {
    if (this.state.dragState && !this.state.dragState.pointerOnly) {
      const idx = this.state.dragState.nodeIndex;
      this.sceneController.controls.enabled = true;
      this.state.dragState = null;
      this.suppressClick = true;
      this.renderCurrentView(false);
      this.setStatus(`Moved node ${this.state.graph.nodes[idx].label || this.state.graph.nodes[idx].id}. Use Ctrl/⌘ + click to inspect it.`);
      return;
    }
    if (this.state.dragState?.pointerOnly && this.state.dragState.moved) this.suppressClick = true;
    this.sceneController.controls.enabled = true;
    this.state.dragState = null;
  }

  setHoveredNode(index) {
    const next = index == null ? null : Number(index);
    if (this.state.hoveredNodeIndex === next) {
      if (next != null && next >= 0) this.showTooltip(next, this.state.hoverPosition.x, this.state.hoverPosition.y);
      return;
    }
    this.state.hoveredNodeIndex = next;
    if (next == null || next < 0) {
      this.hideTooltip();
      this.renderCurrentView(false);
      return;
    }
    this.showTooltip(next, this.state.hoverPosition.x, this.state.hoverPosition.y);
    this.renderCurrentView(false);
  }

  showTooltip(index, clientX, clientY) {
    const graph = this.state.graph;
    if (!graph || index == null || index < 0) return;
    const node = graph.nodes[index];
    this.dom.tooltip.innerHTML = `<strong>${escapeHtml(node.label || node.id)}</strong><div>Degree: ${graph.metrics.degree[index]}</div>`;
    this.dom.tooltip.classList.remove('hidden');
    const rect = this.dom.canvas.getBoundingClientRect();
    this.dom.tooltip.style.left = `${Math.max(8, clientX - rect.left + 14)}px`;
    this.dom.tooltip.style.top = `${Math.max(8, clientY - rect.top + 14)}px`;
  }

  hideTooltip() {
    this.dom.tooltip.classList.add('hidden');
  }

  handleSceneClick(event) {
    if (!this.state.graph || !this.isSelectionModifier(event)) return;
    const picked = this.pickNodeIndexFromEvent(event);
    if (picked >= 0) this.showSelectedNode(picked);
    else this.hideSelectedNode();
  }

  pinSelectedNode() {
    const index = this.state.selectedNodeIndex;
    if (index == null || index < 0 || !this.state.positions2D[index]) return;
    const scaleX = Number(getEl('scaleX').value) || 1;
    const scaleY = Number(getEl('scaleY').value) || 1;
    this.state.pinnedNodes.add(index);
    this.state.pinnedBasePositions[index] = { x: this.state.positions2D[index].x / scaleX, y: this.state.positions2D[index].y / scaleY };
    this.setStatus(`Pinned node ${this.state.graph.nodes[index].label || this.state.graph.nodes[index].id}.`);
    this.updateLegend();
  }

  unpinSelectedNode() {
    const index = this.state.selectedNodeIndex;
    if (index == null || index < 0) return;
    this.state.pinnedNodes.delete(index);
    this.state.pinnedBasePositions[index] = null;
    this.setStatus(`Unpinned node ${this.state.graph.nodes[index].label || this.state.graph.nodes[index].id}.`);
    this.updateLegend();
  }

  clearPins() {
    this.state.pinnedNodes.clear();
    this.state.pinnedBasePositions = new Array(this.state.graph?.nodes.length || 0).fill(null);
    this.updateLegend();
    this.setStatus('Cleared pinned nodes.');
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
    this.renderCurrentView(false);
    this.setStatus(`Selected node: ${node.label || node.id}`);
  }

  hideSelectedNode() {
    this.state.selectedNodeIndex = null;
    this.dom.nodeInfoPanel.classList.add('hidden');
    this.dom.nodeInfoContent.innerHTML = '';
    this.renderCurrentView(false);
  }

  exportScene() {
    const format = getEl('exportFormat')?.value || 'png';
    if (format === 'svg') return this.exportSvg();
    if (format === 'pdf') return this.exportPdf();
    return this.exportPng();
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
      positions: positions.filter((_, i) => this.state.visibleMask[i]),
      sizes: this.state.nodeSizes.filter((_, i) => this.state.visibleMask[i]),
      nodeColors: this.state.nodeColors.filter((_, i) => this.state.visibleMask[i]),
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
    this.setHoveredNode(null);
    this.sceneController.fitToPositions([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 80 }]);
    this.setStatus('Scene reset. Graph data is still loaded.');
  }
}
