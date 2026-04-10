import * as THREE from 'three';
import { loadGraphFromFiles, buildGraph } from './graph.js';
import { SceneController } from './render/scene.js';
import { NodeRenderer } from './render/nodes.points.js';
import { EdgeRenderer } from './render/edges.js';
import { LabelRenderer } from './render/labels.js';
import { buildSceneSvg } from './utils/export.js';
import { METHOD_LIBRARY, REFERENCE_LIBRARY, getMethodById } from './data/methods.js';
import { DEMO_GRAPH_OPTIONS, generateDemoRawGraph } from './studio/demo.js';
import { buildRawPolylines } from './studio/geometry.js';
import {
  QUALITY_PRESETS,
  STYLE_PRESETS,
  getQualityPreset,
  getStylePreset,
  getNodeSizes,
  getNodeColors,
  buildVisibleMask,
  mapPositionsTo3D,
  computeEdgeColors,
  metricsFromPolylines,
  extractDensitySkeleton,
  buildPreviewSvg,
  serializeStudioState
} from './studio/analysis.js';
import { buildFabricationGroup, buildPolylineMeshGroup, evaluatePrintability, exportGroup } from './studio/fabrication.js';

function getEl(id) {
  return document.getElementById(id);
}

function setOptions(select, values, { includeBlank = false, blankLabel = '—', selected = null } = {}) {
  if (!select) return;
  const normalized = Array.isArray(values) ? values : [];
  select.innerHTML = '';
  if (includeBlank) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = blankLabel;
    select.appendChild(option);
  }
  if (!normalized.length && !includeBlank) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '—';
    select.appendChild(option);
  }
  normalized.forEach((value) => {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    if (selected != null && String(value) === String(selected)) option.selected = true;
    select.appendChild(option);
  });
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, digits = 2) {
  if (!Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function downloadText(text, filename, type = 'application/json;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}

function colorToCss(color, fallback = '#86b7ff') {
  if (!color) return fallback;
  if (typeof color === 'string') return color;
  return `#${color.getHexString()}`;
}

function clonePositions(positions = []) {
  return positions.map((p) => ({ x: Number(p.x) || 0, y: Number(p.y) || 0, z: Number(p.z) || 0 }));
}

function makeRandomPositions(count, spread = 90) {
  return Array.from({ length: count }, () => ({
    x: (Math.random() - 0.5) * spread,
    y: (Math.random() - 0.5) * spread,
    z: 0
  }));
}

function makeCircularPositions(graph, radius = 52) {
  const count = graph.nodes.length;
  if (!count) return [];
  return graph.nodes.map((_, i) => {
    const a = (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius, z: 0 };
  });
}

function makeGridPositions(graph, gap = 14) {
  const count = graph.nodes.length;
  const side = Math.ceil(Math.sqrt(count));
  const offset = (side - 1) * gap * 0.5;
  return graph.nodes.map((_, i) => ({
    x: (i % side) * gap - offset,
    y: Math.floor(i / side) * gap - offset,
    z: 0
  }));
}

function makeRadialPositions(graph, step = 9) {
  const degree = graph.metrics.degree || [];
  const order = graph.nodes.map((_, i) => i).sort((a, b) => (degree[b] || 0) - (degree[a] || 0));
  const positions = new Array(graph.nodes.length);
  order.forEach((nodeIndex, rank) => {
    const ring = Math.floor(Math.sqrt(rank));
    const ringCount = Math.max(6, ring * 8);
    const local = rank - ring * ring;
    const angle = (local / ringCount) * Math.PI * 2;
    const radius = 10 + ring * step;
    positions[nodeIndex] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
  });
  return positions.map((p) => p || { x: 0, y: 0, z: 0 });
}

function normalizePositions(positions = [], scale = 1) {
  if (!positions.length) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const size = Math.max(1, maxX - minX, maxY - minY);
  const factor = (70 / size) * scale;
  return positions.map((p) => ({ x: (p.x - cx) * factor, y: (p.y - cy) * factor, z: Number(p.z) || 0 }));
}

function recenterPositions(positions = []) {
  if (!positions.length) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  positions.forEach((p) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  return positions.map((p) => ({ x: (p.x - cx), y: (p.y - cy), z: Number(p.z) || 0 }));
}

function mapPositionsToGlobe(positions2D = [], radius = 96) {
  if (!positions2D.length) return [];
  const xs = positions2D.map((p) => Number(p.x) || 0);
  const ys = positions2D.map((p) => Number(p.y) || 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX);
  const spanY = Math.max(1e-6, maxY - minY);
  const r = Math.max(10, Number(radius) || 96);
  return positions2D.map((pos) => {
    const u = (((Number(pos.x) || 0) - minX) / spanX);
    const v = (((Number(pos.y) || 0) - minY) / spanY);
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

function summarizeNode(node) {
  const attrs = Object.entries(node?.attrs || {});
  const preview = attrs.slice(0, 10).map(([key, value]) => `<div><span class="kv-key">${htmlEscape(key)}</span><span class="kv-value">${htmlEscape(value)}</span></div>`).join('');
  return `
    <div class="selection-block">
      <div><strong>${htmlEscape(node?.label || node?.id || 'Node')}</strong></div>
      <div class="muted small">ID: ${htmlEscape(node?.id || '—')}</div>
      ${preview ? `<div class="kv-grid top-gap">${preview}</div>` : '<div class="muted top-gap">No extra attributes.</div>'}
    </div>
  `;
}

export class App {
  constructor() {
    this.dom = {
      root: getEl('studioShell'),
      workspace: getEl('workspace'),
      viewportStage: getEl('viewportStage'),
      topNavigator: getEl('topNavigator'),
      leftRail: getEl('leftRail'),
      rightRail: getEl('rightRail'),
      toggleLeftRailBtn: getEl('toggleLeftRailBtn'),
      toggleRightRailBtn: getEl('toggleRightRailBtn'),
      modeTabs: Array.from(document.querySelectorAll('.mode-tab')),
      modePanels: Array.from(document.querySelectorAll('.wizard-panel')),
      viewport: getEl('viewport'),
      labelsLayer: getEl('labelsLayer'),
      tooltip: getEl('tooltip'),
      overviewStats: getEl('overviewStats'),
      selectionContent: getEl('selectionContent'),
      bundleMetrics: getEl('bundleMetrics'),
      layerContent: getEl('layerContent'),
      layerAvailability: getEl('layerAvailability'),
      overviewCard: getEl('overviewCard'),
      selectionCard: getEl('selectionCard'),
      bundleMetricsCard: getEl('bundleMetricsCard'),
      layerCard: getEl('layerCard'),
      sceneToolsPanel: getEl('sceneToolsPanel'),
      sceneToolsCollapseBtn: getEl('sceneToolsCollapseBtn'),
      detailsToggleBtn: getEl('detailsToggleBtn'),
      detailsDrawer: getEl('detailsDrawer'),
      openNetworkDetailsBtn: getEl('openNetworkDetailsBtn'),
      networkDetailsModal: getEl('networkDetailsModal'),
      closeNetworkDetailsBtn: getEl('closeNetworkDetailsBtn'),
      quickDisplayLayer: getEl('quickDisplayLayer'),
      quickBackgroundColor: getEl('quickBackgroundColor'),
      quickEdgeOpacity: getEl('quickEdgeOpacity'),
      quickShowNodes: getEl('quickShowNodes'),
      quickShowLabels: getEl('quickShowLabels'),
      quickShowGeometry: getEl('quickShowGeometry'),
      statusText: getEl('statusText'),
      statusStats: getEl('statusStats'),
      progressOverlay: getEl('progressOverlay'),
      progressTitle: getEl('progressTitle'),
      progressBar: getEl('progressBar'),
      progressValue: getEl('progressValue'),
      methodCards: getEl('methodCards'),
      methodDetail: getEl('methodDetail'),
      referenceDrawer: getEl('referenceDrawer'),
      compareBoard: getEl('compareBoard'),
      printabilityPanel: getEl('printabilityPanel'),
      skeletonStats: getEl('skeletonStats'),
      currentStepLabel: getEl('currentStepLabel'),
      currentStepTitle: getEl('currentStepTitle'),
      currentStepBody: getEl('currentStepBody'),
      prevStepBtn: getEl('prevStepBtn'),
      nextStepBtn: getEl('nextStepBtn'),
      bundleParameterHelp: getEl('bundleParameterHelp'),
      bundleParamFields: Array.from(document.querySelectorAll('.method-param')),

      gexfFile: getEl('gexfFile'),
      nodesCsvFile: getEl('nodesCsvFile'),
      edgesCsvFile: getEl('edgesCsvFile'),
      loadGraphBtn: getEl('loadGraphBtn'),
      demoGraphSelect: getEl('demoGraphSelect'),
      loadDemoGraphBtn: getEl('loadDemoGraphBtn'),
      fitSceneFloatingBtn: getEl('fitSceneFloatingBtn'),
      fullscreenBtn: getEl('fullscreenBtn'),
      centerDraggedLayoutBtn: getEl('centerDraggedLayoutBtn'),

      layoutSource: getEl('layoutSource'),
      qualityMode: getEl('qualityMode'),
      layoutIterations: getEl('layoutIterations'),
      layoutRepulsion: getEl('layoutRepulsion'),
      layoutGravity: getEl('layoutGravity'),
      layoutScale: getEl('layoutScale'),
      applyLayoutBtn: getEl('applyLayoutBtn'),
      applyNodeAppearanceBtn: getEl('applyNodeAppearanceBtn'),

      depthMode: getEl('depthMode'),
      depthAttr: getEl('depthAttr'),
      zScale: getEl('zScale'),
      zCategoryGap: getEl('zCategoryGap'),
      applyDepthBtn: getEl('applyDepthBtn'),

      degreeMin: getEl('degreeMin'),
      labelCount: getEl('labelCount'),
      filterAttr: getEl('filterAttr'),
      filterValue: getEl('filterValue'),
      applyFilterBtn: getEl('applyFilterBtn'),

      bundleSamples: getEl('bundleSamples'),
      bundleIterations: getEl('bundleIterations'),
      bundleStrength: getEl('bundleStrength'),
      bundleLift: getEl('bundleLift'),
      bundleClusterCount: getEl('bundleClusterCount'),
      bundleHubCount: getEl('bundleHubCount'),
      bundleDetour: getEl('bundleDetour'),
      bundleExponent: getEl('bundleExponent'),
      directionSplit: getEl('directionSplit'),
      bundleGrid: getEl('bundleGrid'),
      layerAttr: getEl('layerAttr'),
      layerGap: getEl('layerGap'),
      runBundlingBtn: getEl('runBundlingBtn'),
      displayLayer: getEl('displayLayer'),

      skeletonGrid: getEl('skeletonGrid'),
      skeletonThreshold: getEl('skeletonThreshold'),
      skeletonSimplify: getEl('skeletonSimplify'),
      skeletonMinBranch: getEl('skeletonMinBranch'),
      extractSkeletonBtn: getEl('extractSkeletonBtn'),

      stylePreset: getEl('stylePreset'),
      solidPreview: getEl('solidPreview'),
      nodeSizeMode: getEl('nodeSizeMode'),
      sizeAttr: getEl('sizeAttr'),
      nodeColorMode: getEl('nodeColorMode'),
      colorAttr: getEl('colorAttr'),
      edgeColorMode: getEl('edgeColorMode'),
      constantNodeColor: getEl('constantNodeColor'),
      backgroundColor: getEl('backgroundColor'),
      edgeOpacity: getEl('edgeOpacity'),
      solidRadius: getEl('solidRadius'),
      solidTaper: getEl('solidTaper'),
      glowStrength: getEl('glowStrength'),
      focusDim: getEl('focusDim'),
      applyStyleBtn: getEl('applyStyleBtn'),
      resetBackgroundBtn: getEl('resetBackgroundBtn'),

      fabricationSource: getEl('fabricationSource'),
      fabricationRadius: getEl('fabricationRadius'),
      fabricationWidth: getEl('fabricationWidth'),
      nodeConnectorScale: getEl('nodeConnectorScale'),
      nodeShapeMode: getEl('nodeShapeMode'),
      nodeShapeConstant: getEl('nodeShapeConstant'),
      nodeShapeAttr: getEl('nodeShapeAttr'),
      reliefDepth: getEl('reliefDepth'),
      addBasePlate: getEl('addBasePlate'),
      addPedestal: getEl('addPedestal'),
      wallRelief: getEl('wallRelief'),
      buildFabricationBtn: getEl('buildFabricationBtn'),
      clearFabricationBtn: getEl('clearFabricationBtn'),
      exportStlBtn: getEl('exportStlBtn'),
      exportObjBtn: getEl('exportObjBtn'),
      exportGlbBtn: getEl('exportGlbBtn'),

      compareLeft: getEl('compareLeft'),
      compareRight: getEl('compareRight'),
      runCompareBtn: getEl('runCompareBtn'),

      cameraIsoBtn: getEl('cameraIsoBtn'),
      cameraTopBtn: getEl('cameraTopBtn'),
      cameraSideBtn: getEl('cameraSideBtn'),
      presetName: getEl('presetName'),
      savedPresetSelect: getEl('savedPresetSelect'),
      savePresetBtn: getEl('savePresetBtn'),
      loadPresetBtn: getEl('loadPresetBtn'),
      deletePresetBtn: getEl('deletePresetBtn'),
      exportPngBtn: getEl('exportPngBtn'),
      exportSvgBtn: getEl('exportSvgBtn'),
      exportStateBtn: getEl('exportStateBtn')
    };

    this.sceneController = new SceneController({
      canvas: this.dom.viewport,
      onRender: () => this.onRenderFrame()
    });
    this.nodeRenderer = new NodeRenderer(this.sceneController.scene);
    this.edgeRenderer = new EdgeRenderer(this.sceneController.scene);
    this.labelRenderer = new LabelRenderer(this.dom.labelsLayer);
    this.solidPreviewGroup = null;
    this.fabricationGroup = null;

    this.raycaster = new THREE.Raycaster();
    this.raycaster.params.Points.threshold = 12;
    this.pointerNdc = new THREE.Vector2();

    this.state = {
      graph: null,
      graphName: 'Untitled graph',
      quality: 'interactive',
      activeMethod: 'kde',
      positions2D: [],
      positions3D: [],
      mappedPositions3D: [],
      visibleMask: [],
      nodeSizes: [],
      nodeColors: [],
      edgeColors: [],
      rawPolylines: [],
      rawEdgeLookup: [],
      bundlePolylines: [],
      bundleEdgeLookup: [],
      bundleMetrics: null,
      bundleRuntimeMs: 0,
      skeletonPolylines: [],
      skeletonStats: null,
      selectedNodeIndex: null,
      hoveredNodeIndex: null,
      displayLayer: 'bundle',
      fabricationInfo: null,
      showNodes: true,
      showLabels: true,
      showGeometry: true,
      layoutVersion: 0,
      bundleCache: new Map(),
      currentMode: 'load2d',
      dragState: null,
      suppressClick: false,
      uiTheme: 'dark-gray',
      mobileCompact: false,
      _lastMobileCompact: null
    };

    this.stepOrder = ['load2d', 'map3d', 'bundle', 'compare', 'fabricate', 'style', 'export'];
    this.stepMeta = {
      load2d: {
        label: 'Step 1',
        short: '3D mapping',
        title: 'Load your graph and shape the 2D stage',
        body: 'Start with one of the classic demo networks or your own graph, settle the layout, and only then move into depth, bundling, structure, styling, and fabrication.'
      },
      map3d: {
        label: 'Step 2',
        short: 'Bundle',
        title: 'Approve the 2D layout, then map it into 3D',
        body: 'Use depth only after the planar structure is readable. Globe mode is the sapphire wrap for sculptural scenes.'
      },
      bundle: {
        label: 'Step 3',
        short: 'Compare',
        title: 'Choose a bundling philosophy and tune only its own parameters',
        body: 'Select a method, inspect the source literature, and iterate in draft or interactive quality before moving to final rendering.'
      },
      compare: {
        label: 'Step 4',
        short: 'Fabricate',
        title: 'Compare methods and extract structural skeletons',
        body: 'Use side-by-side previews and centerline extraction to decide whether you want faithfulness, flow clarity, or printable trunk structure.'
      },
      fabricate: {
        label: 'Step 5',
        short: 'Style',
        title: 'Prepare a fabrication-ready physical network artifact',
        body: 'Build rods, joints, bases, and relief variants, then evaluate fragility before exporting to your slicer workflow.'
      },
      style: {
        label: 'Step 6',
        short: 'Export',
        title: 'Turn the network into a scientific or artistic material',
        body: 'Adjust background, material language, opacity, taper, and focus dimming after the structure is already settled.'
      },
      export: {
        label: 'Step 7',
        short: 'Done',
        title: 'Save presets and export final assets',
        body: 'Export posters, SVGs, bundle states, and reusable presets once the studio scene is finalized.'
      }
    };

    this.presetStorageKey = 'network-studio-presets-v1';
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.dragHit = new THREE.Vector3();

    this.populateStaticUi();
    this.bindEvents();
    this.applyUiTheme(this.state.uiTheme);
    this.updateFullscreenUi();
    this.syncLayoutMetrics();
    this.setMode('load2d');
    this.applyStylePresetUi();
    this.updateStatus('Ready. Load a graph or choose one of the classic demo networks in Step 1.');
    this.refreshPresetSelect();
    this.renderEmptyState();
  }

  syncLayoutMetrics() {
    const navHeight = Math.max(72, Math.ceil(this.dom.topNavigator?.getBoundingClientRect().height || 88));
    document.documentElement.style.setProperty('--topbar-h', `${navHeight}px`);
    const mobileCompact = window.innerWidth <= 760;
    this.state.mobileCompact = mobileCompact;
    this.dom.workspace?.classList.toggle('mobile-compact', mobileCompact);
    if (this.state._lastMobileCompact !== mobileCompact) {
      this.state._lastMobileCompact = mobileCompact;
      if (mobileCompact) {
        this.setLeftRailCollapsed(true, { skipResize: true });
        this.setRightRailCollapsed(true, { skipResize: true });
      }
    }
    this.dom.root?.classList.toggle('fs-left-collapsed', !!this.dom.leftRail?.classList.contains('collapsed'));
  }

  setLeftRailCollapsed(collapsed, { skipResize = false } = {}) {
    this.dom.leftRail?.classList.toggle('collapsed', collapsed);
    this.dom.workspace?.classList.toggle('left-collapsed', collapsed);
    if (this.dom.toggleLeftRailBtn) this.dom.toggleLeftRailBtn.textContent = collapsed ? 'Tools' : 'Collapse';
    this.dom.root?.classList.toggle('fs-left-collapsed', collapsed);
    if (!skipResize) {
      this.syncLayoutMetrics();
      this.sceneController.resize();
    }
  }

  setRightRailCollapsed(collapsed, { skipResize = false } = {}) {
    this.dom.rightRail?.classList.toggle('collapsed', collapsed);
    this.dom.workspace?.classList.toggle('right-collapsed', collapsed);
    if (this.dom.toggleRightRailBtn) this.dom.toggleRightRailBtn.textContent = collapsed ? 'Guide' : 'Collapse';
    if (!skipResize) {
      this.syncLayoutMetrics();
      this.sceneController.resize();
    }
  }

  applyUiTheme() {
    const safeTheme = 'dark-gray';
    this.state.uiTheme = safeTheme;
    document.body.dataset.uiTheme = safeTheme;
  }

  async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await (this.dom.root?.requestFullscreen?.() || document.documentElement.requestFullscreen?.());
      } else {
        await document.exitFullscreen?.();
      }
    } catch (error) {
      console.warn('Fullscreen toggle failed', error);
    }
    this.updateFullscreenUi();
  }

  updateFullscreenUi() {
    if (!this.dom.fullscreenBtn) return;
    const active = !!document.fullscreenElement;
    this.dom.fullscreenBtn.classList.toggle('active', active);
    this.dom.fullscreenBtn.textContent = active ? '🗗' : '⛶';
    this.dom.fullscreenBtn.title = active ? 'Exit fullscreen' : 'Enter fullscreen';
    this.dom.fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
  }

  bindEvents() {
    this.dom.toggleLeftRailBtn?.addEventListener('click', () => {
      const collapsed = !this.dom.leftRail?.classList.contains('collapsed');
      this.setLeftRailCollapsed(collapsed);
    });

    this.dom.toggleRightRailBtn?.addEventListener('click', () => {
      const collapsed = !this.dom.rightRail?.classList.contains('collapsed');
      this.setRightRailCollapsed(collapsed);
    });

    this.dom.modeTabs.forEach((tab) => {
      tab.addEventListener('click', () => this.setMode(tab.dataset.mode));
    });

    this.dom.prevStepBtn?.addEventListener('click', () => this.goStep(-1));
    this.dom.nextStepBtn?.addEventListener('click', () => this.goStep(1));

    this.dom.sceneToolsCollapseBtn?.addEventListener('click', () => {
      this.dom.sceneToolsPanel?.classList.toggle('collapsed');
      const collapsed = this.dom.sceneToolsPanel?.classList.contains('collapsed');
      if (this.dom.sceneToolsCollapseBtn) this.dom.sceneToolsCollapseBtn.textContent = collapsed ? '⟩' : '⟨';
      this.syncLayoutMetrics();
      this.sceneController.resize();
    });

    // Network details modal (Step 7)
    this.dom.openNetworkDetailsBtn?.addEventListener('click', () => this.setNetworkDetailsModal(true));
    this.dom.closeNetworkDetailsBtn?.addEventListener('click', () => this.setNetworkDetailsModal(false));
    this.dom.networkDetailsModal?.addEventListener('click', (event) => {
      const target = event.target;
      if (target?.dataset?.modalClose) this.setNetworkDetailsModal(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.setNetworkDetailsModal(false);
    });

    this.dom.detailsToggleBtn?.addEventListener('click', () => {
      this.dom.detailsDrawer?.classList.toggle('collapsed');
      const expanded = !this.dom.detailsDrawer?.classList.contains('collapsed');
      this.dom.detailsToggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      const icon = this.dom.detailsToggleBtn.querySelector('.details-toggle-icon');
      if (icon) icon.textContent = expanded ? '↑' : '↓';
    });

    this.dom.loadDemoGraphBtn?.addEventListener('click', () => this.loadDemoGraph());
    this.dom.loadGraphBtn.addEventListener('click', () => this.loadUploadedGraph());
    this.dom.fitSceneFloatingBtn?.addEventListener('click', () => this.fitScene());
    this.dom.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    window.addEventListener('resize', () => this.syncLayoutMetrics());
    document.addEventListener('fullscreenchange', () => { this.updateFullscreenUi(); this.syncLayoutMetrics(); this.sceneController.resize(); });
    this.dom.centerDraggedLayoutBtn?.addEventListener('click', () => {
      if (!this.state.positions2D.length) return;
      this.state.positions2D = recenterPositions(this.state.positions2D);
      this.state.layoutVersion += 1;
      this.applyDepthMapping();
      this.invalidateDerivedStates({ clearCache: true, clearFabrication: true, switchToRaw: true });
      this.refreshEncodingsAndLayers();
      this.fitScene();
      this.updateStatus('Recentered the edited 2D layout. Any derived bundle or fabrication layers were reset to stay consistent.');
    });

    this.dom.applyLayoutBtn.addEventListener('click', async () => {
      const prevVersion = this.state.layoutVersion;
      await this.applyLayout();
      if (this.state.layoutVersion !== prevVersion) {
        this.applyDepthMapping();
        this.invalidateDerivedStates({ clearCache: true, clearFabrication: true, switchToRaw: true });
      }
      this.refreshEncodingsAndLayers();
      this.fitScene();
    });

    this.dom.applyDepthBtn.addEventListener('click', () => {
      this.applyDepthMapping();
      this.invalidateDerivedStates({ clearCache: true, clearFabrication: true, switchToRaw: true });
      this.refreshEncodingsAndLayers();
      this.fitScene();
    });

    this.dom.applyFilterBtn.addEventListener('click', () => {
      this.refreshEncodingsAndLayers();
      this.fitScene();
    });

    this.dom.applyNodeAppearanceBtn?.addEventListener('click', () => {
      this.refreshEncodingsAndLayers();
      this.updateStatus('Updated node size and color encodings.');
    });

    this.dom.filterAttr.addEventListener('change', () => this.populateFilterValues());
    this.dom.nodeShapeMode?.addEventListener('change', () => this.updateFabricationShapeControls());
    this.dom.runBundlingBtn.addEventListener('click', async () => this.runSelectedBundling());
    this.dom.extractSkeletonBtn.addEventListener('click', () => this.runSkeletonExtraction());
    this.dom.displayLayer.addEventListener('change', () => {
      this.state.displayLayer = this.dom.displayLayer.value;
      this.syncQuickSceneTools();
      this.refreshVisibleLayer();
    });
    this.dom.quickDisplayLayer?.addEventListener('change', () => {
      this.dom.displayLayer.value = this.dom.quickDisplayLayer.value;
      this.state.displayLayer = this.dom.displayLayer.value;
      this.refreshVisibleLayer();
    });
    this.dom.quickBackgroundColor?.addEventListener('input', () => {
      this.dom.backgroundColor.value = this.dom.quickBackgroundColor.value;
      const color = this.dom.quickBackgroundColor.value || getStylePreset(this.dom.stylePreset.value).background;
      this.sceneController.setBackground(color);
      document.documentElement.style.setProperty('--studio-bg', color);
    });
    this.dom.quickEdgeOpacity?.addEventListener('input', () => {
      this.dom.edgeOpacity.value = this.dom.quickEdgeOpacity.value;
      this.refreshVisibleLayer();
    });
    this.dom.quickShowNodes?.addEventListener('change', () => {
      this.state.showNodes = !!this.dom.quickShowNodes.checked;
      this.renderNodes();
      this.refreshVisibleLayer();
    });
    this.dom.quickShowLabels?.addEventListener('change', () => {
      this.state.showLabels = !!this.dom.quickShowLabels.checked;
      this.refreshEncodingsAndLayers();
    });
    this.dom.quickShowGeometry?.addEventListener('change', () => {
      this.state.showGeometry = !!this.dom.quickShowGeometry.checked;
      this.refreshVisibleLayer();
    });
    this.dom.applyStyleBtn.addEventListener('click', () => {
      this.applyStylePresetUi();
      this.refreshEncodingsAndLayers();
      this.updateStatus('Applied style and background changes.');
    });
    this.dom.stylePreset.addEventListener('change', () => {
      this.applyStylePresetUi(true);
      this.refreshEncodingsAndLayers();
    });
    this.dom.backgroundColor?.addEventListener('input', () => {
      const color = this.dom.backgroundColor.value || getStylePreset(this.dom.stylePreset.value).background;
      if (this.dom.quickBackgroundColor) this.dom.quickBackgroundColor.value = color;
      this.sceneController.setBackground(color);
      document.documentElement.style.setProperty('--studio-bg', color);
    });
    this.dom.edgeOpacity?.addEventListener('input', () => {
      if (this.dom.quickEdgeOpacity) this.dom.quickEdgeOpacity.value = this.dom.edgeOpacity.value;
      this.refreshVisibleLayer();
    });
    this.dom.resetBackgroundBtn?.addEventListener('click', () => {
      this.dom.backgroundColor.value = getStylePreset(this.dom.stylePreset.value).background;
      this.applyStylePresetUi(true);
      this.refreshEncodingsAndLayers();
    });

    this.dom.buildFabricationBtn.addEventListener('click', () => this.buildFabricationPreview());
    this.dom.clearFabricationBtn.addEventListener('click', () => this.clearFabricationPreview());
    this.dom.exportStlBtn.addEventListener('click', () => this.exportFabrication('stl'));
    this.dom.exportObjBtn.addEventListener('click', () => this.exportFabrication('obj'));
    this.dom.exportGlbBtn.addEventListener('click', () => this.exportFabrication('glb'));

    this.dom.runCompareBtn.addEventListener('click', async () => this.runComparisonBoard());

    this.dom.cameraIsoBtn.addEventListener('click', () => this.setCameraPreset('iso'));
    this.dom.cameraTopBtn.addEventListener('click', () => this.setCameraPreset('top'));
    this.dom.cameraSideBtn.addEventListener('click', () => this.setCameraPreset('side'));
    this.dom.savePresetBtn.addEventListener('click', () => this.savePreset());
    this.dom.loadPresetBtn.addEventListener('click', () => this.loadPreset());
    this.dom.deletePresetBtn.addEventListener('click', () => this.deletePreset());
    this.dom.exportPngBtn.addEventListener('click', () => this.exportPng());
    this.dom.exportSvgBtn.addEventListener('click', () => this.exportSvg());
    this.dom.exportStateBtn.addEventListener('click', () => this.exportState());

    this.dom.viewport.addEventListener('pointerdown', (event) => this.handlePointerDown(event));
    this.dom.viewport.addEventListener('pointermove', (event) => this.handlePointerMove(event));
    this.dom.viewport.addEventListener('pointerup', (event) => this.handlePointerUp(event));
    this.dom.viewport.addEventListener('pointerleave', () => this.handlePointerLeave());
    this.dom.viewport.addEventListener('click', () => {
      if (this.state.suppressClick) {
        this.state.suppressClick = false;
        return;
      }
      this.commitSelectionFromHover();
    });
  }

  populateStaticUi() {
    setOptions(this.dom.stylePreset, Object.keys(STYLE_PRESETS), { selected: 'scientific-dark' });
    this.updateFabricationShapeControls();
    setOptions(this.dom.compareLeft, METHOD_LIBRARY.map((m) => m.id), { selected: 'kde' });
    setOptions(this.dom.compareRight, METHOD_LIBRARY.map((m) => m.id), { selected: 'mingle' });

    this.dom.methodCards.innerHTML = '';
    METHOD_LIBRARY.forEach((method) => {
      const card = document.createElement('button');
      card.className = `method-card ${method.id === this.state.activeMethod ? 'active' : ''}`;
      card.dataset.methodId = method.id;
      card.innerHTML = `
        <div class="method-card-top">
          <span class="method-family">${htmlEscape(method.family)}</span>
          <span class="method-status">${htmlEscape(method.status)}</span>
        </div>
        <div class="method-name">${htmlEscape(method.name)}</div>
        <div class="method-badge">${htmlEscape(method.sourceBadge)}</div>
      `;
      card.addEventListener('click', () => {
        this.state.activeMethod = method.id;
        this.updateMethodSelectionUi();
      });
      this.dom.methodCards.appendChild(card);
    });
    this.updateMethodSelectionUi();
    this.dom.backgroundColor.value = getStylePreset('scientific-dark').background;

    this.dom.referenceDrawer.innerHTML = Object.values(REFERENCE_LIBRARY)
      .sort((a, b) => b.year - a.year)
      .map((ref) => `
        <article class="reference-card">
          <div class="reference-year">${ref.year}</div>
          <div class="reference-body">
            <h3>${htmlEscape(ref.title)}</h3>
            <div class="muted">${htmlEscape(ref.authors)}</div>
            <p>${htmlEscape(ref.why)}</p>
            <a href="${htmlEscape(ref.link)}" target="_blank" rel="noreferrer">Open source</a>
          </div>
        </article>
      `)
      .join('');
  }

  updateMethodSelectionUi() {
    const method = getMethodById(this.state.activeMethod);
    Array.from(this.dom.methodCards.querySelectorAll('.method-card')).forEach((card) => {
      card.classList.toggle('active', card.dataset.methodId === method.id);
    });
    const refs = (method.references || []).map((refId) => REFERENCE_LIBRARY[refId]).filter(Boolean);
    this.dom.methodDetail.innerHTML = `
      <div class="method-detail-head">
        <div>
          <div class="eyebrow">${htmlEscape(method.family)}</div>
          <h3>${htmlEscape(method.name)}</h3>
        </div>
        <div class="chip">${htmlEscape(method.sourceBadge)}</div>
      </div>
      <p>${htmlEscape(method.intuition)}</p>
      <div class="method-grid">
        <div><strong>Strengths</strong><p>${htmlEscape(method.strengths)}</p></div>
        <div><strong>Weaknesses</strong><p>${htmlEscape(method.weaknesses)}</p></div>
        <div><strong>Tradeoffs</strong><p>${htmlEscape(method.tradeoffs)}</p></div>
        <div><strong>Parameters</strong><p>${htmlEscape((method.params || []).join(', ') || 'Fixed baseline')}</p></div>
      </div>
      <div class="method-ref-list">
        ${(refs.length ? refs : [{ title: 'No external citation', authors: 'Built-in baseline', year: '', why: 'Used as the uncluttered reference view.', link: '#' }]).map((ref) => `
          <div class="ref-pill">
            <div class="ref-pill-title">${htmlEscape(ref.title)}</div>
            <div class="ref-pill-meta">${htmlEscape(ref.authors)} ${ref.year ? `· ${ref.year}` : ''}</div>
          </div>
        `).join('')}
      </div>
    `;
    this.updateMethodParameterVisibility(method);
  }

  updateMethodParameterVisibility(method = getMethodById(this.state.activeMethod)) {
    const guide = {
      straight: 'Use this as the uncluttered baseline. It is the best way to verify raw topology before bundling.',
      arc: 'Lift adds vertical separation. Increase it when you want elegant 3D arcs without strong corridor formation.',
      hub: 'Hub count controls how many corridor anchors exist. Fewer hubs yield stronger mediation and more stylized central corridors.',
      legacy: 'Detour cap and exponent control how adventurous path rerouting becomes. Keep them moderate if fidelity matters.',
      kde: 'Grid and iterations set the smoothness of the flow field. Higher values create cleaner corridors but cost more time.',
      mingle: 'Cluster count decides how many shared spines can form. Fewer clusters create more dramatic aggregation.',
      divided: 'Direction split separates opposing flows into lanes. Increase it when directional reading matters more than compactness.',
      layered: 'Choose a meaningful categorical attribute. Layer gap preserves semantic separation during weaving.',
      space3d: 'Use this when depth is part of the structure, not just decoration. Cluster count and lift jointly shape volumetric corridors.'
    };
    const paramHelp = {
      samples: 'How many control samples are used along each edge. Higher values make curves smoother but more expensive.',
      iterations: 'How many refinement passes the method performs. More passes usually mean tighter or cleaner bundles, but longer runtime.',
      strength: 'How strongly edges are pulled toward shared corridors. Increase for stronger aggregation; reduce for more fidelity to the raw routes.',
      lift: 'How much the bundle is lifted or arced away from the raw layout plane. Useful for airy 3D separation and sculptural emphasis.',
      clusterCount: 'How many corridor groups or bundle spines the method is allowed to form. Fewer clusters create broader trunks; more clusters preserve local detail.',
      hubCount: 'How many high-traffic relay hubs can mediate paths. Lower values centralize the flow; higher values distribute it.',
      detourCap: 'Upper bound on how far rerouted paths are allowed to deviate from the direct connection. Higher values encourage shared routes but inflate path length.',
      exponent: 'Bias applied to legacy rerouting. Larger values emphasize strong corridors and suppress weaker alternatives.',
      directionSplit: 'Separates opposing directions into adjacent lanes. Increase it when directional readability is more important than maximum compactness.',
      grid: 'Resolution of the density or vector field used by image-space approximations. Higher grid sizes create cleaner corridors but need more computation and memory.',
      layerAttr: 'Categorical attribute used to keep bundles separated into semantic layers. Choose an attribute that represents communities, time slices, or strata.',
      layerGap: 'Distance preserved between attribute layers. Higher values make layers easier to read but expand the scene.'
    };
    const paramSet = new Set(method.params || []);
    this.dom.bundleParamFields.forEach((field) => {
      const isVisible = paramSet.has(field.dataset.param);
      field.classList.toggle('hidden', !isVisible);
      let help = field.querySelector('.field-help');
      if (!help) {
        help = document.createElement('div');
        help.className = 'field-help';
        field.appendChild(help);
      }
      help.textContent = isVisible ? (paramHelp[field.dataset.param] || 'Method-specific tuning control.') : '';
      field.title = paramHelp[field.dataset.param] || '';
    });
    if (this.dom.bundleParameterHelp) {
      const visibleHelp = (method.params || []).map((param) => `<li><strong>${htmlEscape(param)}</strong>: ${htmlEscape(paramHelp[param] || 'Method-specific tuning control.')}</li>`).join('');
      this.dom.bundleParameterHelp.innerHTML = `
        <div class="hint-block">
          ${htmlEscape(guide[method.id] || 'Adjust the visible controls and rerun the method to compare bundle behavior.')}
          <div class="top-gap">Source indicator: <strong>${htmlEscape(method.sourceBadge)}</strong>.</div>
        </div>
        ${visibleHelp ? `<div class="hint-block top-gap"><strong>Visible parameters</strong><ul class="hint-list">${visibleHelp}</ul></div>` : ''}
      `;
    }
  }

  toggleHud(cardId) {
    const card = this.dom[cardId] || getEl(cardId);
    if (!card) return;
    this.setHudVisible(cardId, card.classList.contains('hidden'));
  }

  setHudVisible(cardId, visible = true) {
    const card = this.dom[cardId] || getEl(cardId);
    if (!card) return;
    card.classList.toggle('hidden', !visible);
  }

  syncQuickSceneTools() {
    if (this.dom.quickDisplayLayer) this.dom.quickDisplayLayer.value = this.dom.displayLayer.value;
    if (this.dom.quickBackgroundColor && this.dom.backgroundColor) this.dom.quickBackgroundColor.value = this.dom.backgroundColor.value;
    if (this.dom.quickEdgeOpacity && this.dom.edgeOpacity) this.dom.quickEdgeOpacity.value = this.dom.edgeOpacity.value;
    if (this.dom.quickShowNodes) this.dom.quickShowNodes.checked = !!this.state.showNodes;
    if (this.dom.quickShowLabels) this.dom.quickShowLabels.checked = !!this.state.showLabels;
    if (this.dom.quickShowGeometry) this.dom.quickShowGeometry.checked = !!this.state.showGeometry;
  }

  computeAvailableLayers() {
    return {
      raw: !!this.state.rawPolylines.length,
      bundle: !!this.state.bundlePolylines.length,
      skeleton: !!this.state.skeletonPolylines.length,
      fabrication: !!this.fabricationGroup
    };
  }

  renderLayerAvailability() {
    const available = this.computeAvailableLayers();
    const html = ['raw', 'bundle', 'skeleton', 'fabrication'].map((layer) => {
      const active = this.state.displayLayer === layer;
      const enabled = available[layer] || layer === 'raw';
      const label = layer === 'raw' ? 'Raw' : layer === 'bundle' ? 'Bundle' : layer === 'skeleton' ? 'Skeleton' : 'Fabrication';
      return `<button class="layer-chip ${active ? 'active' : ''} ${enabled ? '' : 'disabled'}" data-layer-chip="${layer}" ${enabled ? '' : 'disabled'}>${label}</button>`;
    }).join('');
    if (this.dom.layerAvailability) {
      this.dom.layerAvailability.innerHTML = html;
      Array.from(this.dom.layerAvailability.querySelectorAll('[data-layer-chip]')).forEach((btn) => {
        btn.addEventListener('click', () => {
          this.dom.displayLayer.value = btn.dataset.layerChip;
          this.state.displayLayer = btn.dataset.layerChip;
          this.syncQuickSceneTools();
          this.refreshVisibleLayer();
        });
      });
    }
  }

  setMode(mode) {
    const safeMode = this.stepOrder.includes(mode) ? mode : this.stepOrder[0];
    const previousMode = this.state.currentMode;
    this.state.currentMode = safeMode;
    this.dom.modeTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === safeMode));
    this.dom.modePanels.forEach((panel) => panel.classList.toggle('active', panel.dataset.modePanel === safeMode));

    const meta = this.stepMeta[safeMode] || {};
    if (this.dom.currentStepLabel) this.dom.currentStepLabel.textContent = meta.label || 'Step';
    if (this.dom.currentStepTitle) this.dom.currentStepTitle.textContent = meta.title || 'Studio step';
    if (this.dom.currentStepBody) this.dom.currentStepBody.textContent = meta.body || '';

    const index = this.stepOrder.indexOf(safeMode);
    if (this.dom.prevStepBtn) this.dom.prevStepBtn.disabled = index <= 0;
    if (this.dom.nextStepBtn) this.dom.nextStepBtn.disabled = index >= this.stepOrder.length - 1;
    if (this.dom.nextStepBtn) this.dom.nextStepBtn.textContent = '→';
    if (this.dom.prevStepBtn) this.dom.prevStepBtn.textContent = '←';

    if (this.state.graph) {
      if (safeMode === 'map3d' && previousMode !== 'map3d') {
        this.applyDepthMapping();
      }
      if (safeMode === 'load2d') {
        this.dom.displayLayer.value = 'raw';
        this.state.displayLayer = 'raw';
      }
      this.refreshEncodingsAndLayers();
      if (safeMode === 'load2d' && previousMode !== 'load2d') {
        this.updateStatus('2D stage active. Adjust the layout, filters, node encodings, and labels before moving on. Only valid scene states remain available.');
      }
      if (safeMode === 'map3d' && previousMode !== 'map3d') {
        this.updateStatus('3D mapping stage active. Tune the depth strategy, then continue into bundling.');
      }
    }

    this.syncLayoutMetrics();
    this.sceneController.resize();
  }

  goStep(direction = 1) {
    const index = this.stepOrder.indexOf(this.state.currentMode);
    const nextIndex = Math.max(0, Math.min(this.stepOrder.length - 1, index + direction));
    this.setMode(this.stepOrder[nextIndex]);
  }

  setProgress(title = 'Working…', percent = 0, visible = true) {
    this.dom.progressTitle.textContent = title;
    this.dom.progressBar.value = percent;
    this.dom.progressValue.textContent = `${Math.round(percent)}%`;
    this.dom.progressOverlay.classList.toggle('hidden', !visible);
  }

  updateStatus(text, extra = null) {
    this.dom.statusText.textContent = text;
    if (extra != null) this.dom.statusStats.textContent = extra;
  }

  renderEmptyState() {
    this.dom.overviewStats.innerHTML = 'Load a graph to inspect bundle methods, skeletons, and fabrication geometry.';
    this.dom.selectionContent.innerHTML = 'Hover or click a node to inspect metadata.';
    this.dom.bundleMetrics.innerHTML = 'No bundle has been computed yet.';
    this.dom.layerContent.innerHTML = 'Display layer: raw graph.';
    this.dom.skeletonStats.innerHTML = 'No skeleton extracted yet.';
    this.dom.printabilityPanel.innerHTML = 'Build a physical model to see printability hints.';
    this.syncQuickSceneTools();
    this.renderLayerAvailability();
  }

  setNetworkDetailsModal(isOpen) {
    const modal = this.dom.networkDetailsModal;
    if (!modal) return;
    modal.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      if (this.state.graph) {
        this.updateOverview();
        const layer = this.getCurrentLayerPayload();
        this.updateMetricsPanel(layer);
        this.updateLayerPanel(layer);
      } else {
        this.dom.overviewStats.innerHTML = 'Load a graph to inspect bundle methods, skeletons, and fabrication geometry.';
        this.dom.bundleMetrics.innerHTML = 'No bundle has been computed yet.';
        this.dom.layerContent.innerHTML = 'Display layer: raw graph.';
      }
    }
  }


  makeFlatViewPositions() {
    return clonePositions(this.state.positions2D.map((p) => ({ x: p.x, y: p.y, z: 0 })));
  }

  syncViewPositionsForStage(layerOverride = null) {
    const layer = layerOverride || this.state.displayLayer || 'raw';
    const shouldUseFlat = this.state.currentMode === 'load2d' && layer === 'raw';
    if (shouldUseFlat || !this.state.mappedPositions3D?.length) {
      this.state.positions3D = this.makeFlatViewPositions();
      return;
    }
    this.state.positions3D = clonePositions(this.state.mappedPositions3D);
  }

  rebuildRawLayer() {
    if (!this.state.graph) return;
    const quality = getQualityPreset(this.state.quality || this.dom.qualityMode.value);
    const raw = buildRawPolylines(this.state.graph, this.state.positions3D, this.state.visibleMask, quality.maxEdges);
    this.state.rawPolylines = raw.map((entry) => entry.points);
    this.state.rawEdgeLookup = raw.map((entry) => entry.edgeIndex);
  }

  invalidateDerivedStates({ clearCache = true, clearFabrication = true, switchToRaw = true } = {}) {
    if (clearCache) this.state.bundleCache.clear();
    this.state.bundlePolylines = [];
    this.state.bundleEdgeLookup = [];
    this.state.bundleMetrics = null;
    this.state.bundleRuntimeMs = 0;
    this.state.skeletonPolylines = [];
    this.state.skeletonStats = null;
    this.dom.skeletonStats.innerHTML = 'No skeleton extracted yet.';
    if (clearFabrication) this.clearFabricationPreview(false);
    if (switchToRaw) {
      this.dom.displayLayer.value = 'raw';
      this.state.displayLayer = 'raw';
    }
  }

  async loadUploadedGraph() {
    const gexfFile = this.dom.gexfFile.files?.[0] || null;
    const nodesCsvFile = this.dom.nodesCsvFile.files?.[0] || null;
    const edgesCsvFile = this.dom.edgesCsvFile.files?.[0] || null;
    if (!gexfFile && !(nodesCsvFile && edgesCsvFile)) {
      this.updateStatus('Select one GEXF file, or both nodes and edges CSV files.');
      return;
    }

    try {
      this.setProgress('Reading graph files…', 0, true);
      const rawGraph = await loadGraphFromFiles({
        gexfFile,
        nodesCsvFile,
        edgesCsvFile,
        onPhase: (phase) => this.setProgress(phase, this.dom.progressBar.value, true),
        onProgress: (percent) => this.setProgress('Reading graph files…', percent, true)
      });
      const name = gexfFile?.name || `${nodesCsvFile?.name || 'nodes'} + ${edgesCsvFile?.name || 'edges'}`;
      this.loadGraph(rawGraph, name);
      this.updateStatus(`Loaded ${name}.`, `Nodes: ${this.state.graph.nodes.length.toLocaleString()} · Edges: ${this.state.graph.edges.length.toLocaleString()}`);
    } catch (error) {
      console.error(error);
      this.updateStatus(`Load failed: ${error?.message || 'Unknown error'}`);
    } finally {
      this.setProgress('', 0, false);
    }
  }

  loadDemoGraph() {
    const key = this.dom.demoGraphSelect?.value || 'les-miserables';
    const rawGraph = generateDemoRawGraph(key);
    const label = DEMO_GRAPH_OPTIONS.find((entry) => entry.value === key)?.label || rawGraph.name || 'Demo graph';
    this.loadGraph(rawGraph, label);
    this.updateStatus(`Loaded demo graph: ${label}.`, `Nodes: ${this.state.graph.nodes.length.toLocaleString()} · Edges: ${this.state.graph.edges.length.toLocaleString()}`);
  }

  loadGraph(rawGraph, name = 'Graph') {
    const graph = buildGraph(rawGraph);
    this.state.graph = graph;
    this.state.graphName = name;
    this.state.layoutVersion += 1;
    this.state.bundleCache.clear();
    this.state.bundlePolylines = [];
    this.state.bundleEdgeLookup = [];
    this.state.skeletonPolylines = [];
    this.state.skeletonStats = null;
    this.state.selectedNodeIndex = null;
    this.state.hoveredNodeIndex = null;
    this.clearFabricationPreview(false);

    const existing2D = graph.flags.has2DPositions
      ? graph.nodes.map((node, i) => ({ x: Number(node.x) || i * 0.25, y: Number(node.y) || 0, z: 0 }))
      : makeRandomPositions(graph.nodes.length);
    this.state.positions2D = normalizePositions(existing2D, Number(this.dom.layoutScale.value) || 1);

    const depthMode = graph.flags.hasZPositions ? 'original-z' : 'flat';
    this.dom.depthMode.value = depthMode;
    this.applyDepthMapping();
    this.syncViewPositionsForStage('raw');
    this.populateGraphControls();
    this.refreshEncodingsAndLayers();
    this.fitScene();
    this.setMode('load2d');
  }

  populateGraphControls() {
    const graph = this.state.graph;
    if (!graph) return;
    const allAttrs = graph.attributes.nodeAll || [];
    const numericAttrs = graph.attributes.nodeNumeric || [];
    const categoricalAttrs = graph.attributes.nodeCategorical || [];

    setOptions(this.dom.depthAttr, allAttrs, { includeBlank: true });
    setOptions(this.dom.sizeAttr, numericAttrs, { includeBlank: true });
    setOptions(this.dom.colorAttr, allAttrs, { includeBlank: true });
    setOptions(this.dom.filterAttr, categoricalAttrs, { includeBlank: true, blankLabel: 'All nodes' });
    setOptions(this.dom.layerAttr, categoricalAttrs, { includeBlank: true });
    const shapeAttrs = Array.from(new Set(['color', ...allAttrs]));
    setOptions(this.dom.nodeShapeAttr, shapeAttrs, { includeBlank: true, blankLabel: 'Pick an attribute' });

    const preferredColor = categoricalAttrs.includes('community') ? 'community' : allAttrs[0] || '';
    if (preferredColor) this.dom.colorAttr.value = preferredColor;
    const preferredSize = numericAttrs.includes('influence') ? 'influence' : numericAttrs[0] || '';
    if (preferredSize) this.dom.sizeAttr.value = preferredSize;
    const preferredDepth = allAttrs.includes('layer') ? 'layer' : allAttrs.includes('timeSlice') ? 'timeSlice' : '';
    if (preferredDepth) this.dom.depthAttr.value = preferredDepth;
    const preferredLayer = categoricalAttrs.includes('layer') ? 'layer' : categoricalAttrs[0] || '';
    if (preferredLayer) this.dom.layerAttr.value = preferredLayer;
    const preferredFilter = categoricalAttrs.includes('community') ? 'community' : categoricalAttrs[0] || '';
    if (preferredFilter) this.dom.filterAttr.value = preferredFilter;
    const preferredShapeAttr = categoricalAttrs.includes('community') ? 'community' : (shapeAttrs.includes('color') ? 'color' : shapeAttrs[0] || '');
    if (preferredShapeAttr) this.dom.nodeShapeAttr.value = preferredShapeAttr;
    this.populateFilterValues();
    this.updateFabricationShapeControls();

    const available = graph.flags.has2DPositions ? 'existing' : 'forceatlas2';
    this.dom.layoutSource.value = available;
  }

  updateFabricationShapeControls() {
    const mode = this.dom.nodeShapeMode?.value || 'constant';
    if (this.dom.nodeShapeAttr) this.dom.nodeShapeAttr.disabled = mode !== 'attribute';
  }

  buildFabricationNodeDescriptors() {
    const graph = this.state.graph;
    if (!graph) return { nodes: [], mappingHtml: '' };
    const visibleIndices = this.state.positions3D.map((_, i) => i).filter((i) => this.state.visibleMask[i]);
    const mode = this.dom.nodeShapeMode?.value || 'constant';
    const baseShape = this.dom.nodeShapeConstant?.value || 'sphere';
    const attr = this.dom.nodeShapeAttr?.value || '';
    const shapeCycle = [baseShape, 'sphere', 'cube', 'tri-prism', 'square-prism', 'hex-prism', 'octahedron', 'icosahedron']
      .filter((value, index, array) => array.indexOf(value) === index);
    const shapeLabels = {
      sphere: 'Sphere',
      cube: 'Cube',
      'tri-prism': 'Triangular prism',
      'square-prism': 'Square prism',
      'hex-prism': 'Hexagonal prism',
      octahedron: 'Octahedron',
      icosahedron: 'Icosahedron'
    };

    const keyedValues = [];
    let mappingHtml = '';
    if (mode === 'attribute' && attr) {
      const values = [...new Set(visibleIndices.map((i) => String(graph.nodes[i]?.attrs?.[attr] ?? graph.nodes[i]?.[attr] ?? 'missing')))].sort((a, b) => a.localeCompare(b));
      const map = new Map(values.map((value, idx) => [value, shapeCycle[idx % shapeCycle.length]]));
      mappingHtml = `<div class="top-gap"><strong>Node shape mapping</strong>${values.map((value) => `<div>${htmlEscape(value)} → ${htmlEscape(shapeLabels[map.get(value)] || map.get(value))}</div>`).join('')}</div>`;
      visibleIndices.forEach((i) => keyedValues.push({
        index: i,
        shape: map.get(String(graph.nodes[i]?.attrs?.[attr] ?? graph.nodes[i]?.[attr] ?? 'missing')) || baseShape,
        color: colorToCss(this.state.nodeColors[i], this.dom.constantNodeColor?.value || '#86b7ff')
      }));
    } else if (mode === 'node-color') {
      const values = [...new Set(visibleIndices.map((i) => colorToCss(this.state.nodeColors[i], this.dom.constantNodeColor?.value || '#86b7ff')))].sort((a, b) => a.localeCompare(b));
      const map = new Map(values.map((value, idx) => [value, shapeCycle[idx % shapeCycle.length]]));
      mappingHtml = `<div class="top-gap"><strong>Node shape mapping</strong>${values.map((value) => `<div><span class="color-swatch" style="background:${htmlEscape(value)}"></span>${htmlEscape(value)} → ${htmlEscape(shapeLabels[map.get(value)] || map.get(value))}</div>`).join('')}</div>`;
      visibleIndices.forEach((i) => {
        const nodeColor = colorToCss(this.state.nodeColors[i], this.dom.constantNodeColor?.value || '#86b7ff');
        keyedValues.push({ index: i, shape: map.get(nodeColor) || baseShape, color: nodeColor });
      });
    } else {
      mappingHtml = `<div class="top-gap"><strong>Node shape</strong>: ${htmlEscape(shapeLabels[baseShape] || baseShape)}</div>`;
      visibleIndices.forEach((i) => keyedValues.push({
        index: i,
        shape: baseShape,
        color: colorToCss(this.state.nodeColors[i], this.dom.constantNodeColor?.value || '#86b7ff')
      }));
    }

    const nodes = keyedValues.map(({ index, shape, color }) => ({
      x: this.state.positions3D[index].x,
      y: this.state.positions3D[index].y,
      z: this.state.positions3D[index].z,
      shape,
      color
    }));
    return { nodes, mappingHtml };
  }

  populateFilterValues() {
    const graph = this.state.graph;
    if (!graph) return;
    const attr = this.dom.filterAttr.value;
    if (!attr) {
      setOptions(this.dom.filterValue, ['all'], { selected: 'all' });
      return;
    }
    const values = [...new Set(graph.nodes.map((n) => String(n.attrs?.[attr] ?? n[attr] ?? 'missing')))].sort((a, b) => a.localeCompare(b));
    setOptions(this.dom.filterValue, ['all', ...values], { selected: 'all' });
  }

  async applyLayout() {
    const graph = this.state.graph;
    if (!graph) return;
    const source = this.dom.layoutSource.value;
    const scale = Number(this.dom.layoutScale.value) || 1;

    if (source === 'existing') {
      const positions = graph.flags.has2DPositions
        ? graph.nodes.map((node, i) => ({ x: Number(node.x) || i * 0.25, y: Number(node.y) || 0, z: 0 }))
        : makeRandomPositions(graph.nodes.length);
      this.state.positions2D = normalizePositions(positions, scale);
      this.state.layoutVersion += 1;
      return;
    }

    if (source === 'random') {
      this.state.positions2D = normalizePositions(makeRandomPositions(graph.nodes.length), scale);
      this.state.layoutVersion += 1;
      return;
    }
    if (source === 'circular') {
      this.state.positions2D = normalizePositions(makeCircularPositions(graph), scale);
      this.state.layoutVersion += 1;
      return;
    }
    if (source === 'grid') {
      this.state.positions2D = normalizePositions(makeGridPositions(graph), scale);
      this.state.layoutVersion += 1;
      return;
    }
    if (source === 'radial') {
      this.state.positions2D = normalizePositions(makeRadialPositions(graph), scale);
      this.state.layoutVersion += 1;
      return;
    }

    if (source === 'forceatlas2') {
      this.setProgress('Running ForceAtlas2 layout…', 0, true);
      const worker = new Worker(new URL('./workers/layoutWorker.js', import.meta.url), { type: 'module' });
      const payload = {
        nodes: this.state.positions2D.map((p, i) => ({ index: i, x: p.x, y: p.y, size: this.state.nodeSizes[i] || 1 })),
        edges: graph.edges.map((edge) => ({ source: edge.sourceIndex, target: edge.targetIndex, weight: edge.weight || 1 })),
        iterations: Number(this.dom.layoutIterations.value) || 280,
        gravity: Number(this.dom.layoutGravity.value) || 0.42,
        repulsion: Number(this.dom.layoutRepulsion.value) || 7.2,
        barnesHutOptimize: true,
        adjustSizes: true,
        outboundAttractionDistribution: true,
        pinned: []
      };
      const positions = await new Promise((resolve, reject) => {
        worker.onmessage = (event) => {
          const { type, percent, positions: result, message } = event.data || {};
          if (type === 'progress') this.setProgress('Running ForceAtlas2 layout…', percent ?? 0, true);
          if (type === 'result') resolve(result || []);
          if (type === 'error') reject(new Error(message || 'ForceAtlas2 failed.'));
        };
        worker.onerror = (error) => reject(error);
        worker.postMessage(payload);
      }).finally(() => worker.terminate());
      this.state.positions2D = normalizePositions(positions.map((p) => ({ x: p.x, y: p.y, z: 0 })), scale);
      this.state.layoutVersion += 1;
      this.setProgress('', 0, false);
    }
  }

  applyDepthMapping() {
    const graph = this.state.graph;
    if (!graph) return;
    const mode = this.dom.depthMode.value;
    if (mode === 'globe') {
      this.state.mappedPositions3D = mapPositionsToGlobe(this.state.positions2D, (Number(this.dom.zScale.value) || 24) * 4);
    } else {
      this.state.mappedPositions3D = mapPositionsTo3D(graph, this.state.positions2D, {
        mode,
        attr: this.dom.depthAttr.value,
        zScale: Number(this.dom.zScale.value) || 24,
        categoryGap: Number(this.dom.zCategoryGap.value) || 14,
        jitter: this.dom.depthMode.value === 'random' ? 1.5 : 0,
        preserveExistingZ: true
      });
    }
    this.syncViewPositionsForStage(this.state.displayLayer || 'raw');
  }

  refreshEncodingsAndLayers() {
    const graph = this.state.graph;
    if (!graph) {
      this.renderEmptyState();
      return;
    }

    this.state.quality = this.dom.qualityMode.value;
    this.state.visibleMask = buildVisibleMask(graph, {
      degreeMin: Number(this.dom.degreeMin.value) || 0,
      categoryAttr: this.dom.filterAttr.value,
      categoryValue: this.dom.filterValue.value || 'all'
    });

    const style = getStylePreset(this.dom.stylePreset.value);
    this.state.nodeSizes = getNodeSizes(graph, this.dom.nodeSizeMode.value, this.dom.sizeAttr.value, 1.6);
    this.state.nodeColors = getNodeColors(graph, {
      colorMode: this.dom.nodeColorMode.value,
      colorAttr: this.dom.colorAttr.value,
      constantColor: this.dom.constantNodeColor.value,
      rampStart: style.edgeStart,
      rampEnd: style.edgeEnd
    });
    this.state.edgeColors = computeEdgeColors(graph, this.state.nodeColors, style, this.dom.edgeColorMode.value);

    this.syncViewPositionsForStage(this.state.displayLayer || 'raw');
    this.rebuildRawLayer();

    const background = this.dom.backgroundColor?.value || style.background;
    this.sceneController.setBackground(background);
    document.documentElement.style.setProperty('--studio-bg', background);
    this.renderNodes();
    this.refreshVisibleLayer();
    this.updateOverview();
    this.updateSelectionPanel();
    this.syncQuickSceneTools();
    this.renderLayerAvailability();
  }

  getFocusContext() {
    const graph = this.state.graph;
    const focusSet = new Set();
    const focusEdgeSet = new Set();
    if (graph && this.state.selectedNodeIndex != null) {
      const selected = this.state.selectedNodeIndex;
      const neighbors = graph.metrics.neighbors[selected] || [];
      const neighborSet = new Set(neighbors);
      focusSet.add(selected);
      neighbors.forEach((n) => focusSet.add(n));
      graph.edges.forEach((edge, edgeIndex) => {
        const a = edge.sourceIndex;
        const b = edge.targetIndex;
        const isSelectedLink = (a === selected && neighborSet.has(b)) || (b === selected && neighborSet.has(a));
        if (isSelectedLink) focusEdgeSet.add(edgeIndex);
      });
    }
    return { focusSet, focusEdgeSet };
  }

  renderNodes() {
    const { focusSet } = this.getFocusContext();
    this.nodeRenderer.update({
      positions: this.state.positions3D,
      sizes: this.state.nodeSizes,
      colors: this.state.nodeColors,
      visibleMask: this.state.visibleMask,
      emphasisSet: focusSet,
      selectedIndex: this.state.selectedNodeIndex ?? -1,
      dimOpacity: 0.1
    });
    if (this.nodeRenderer.mesh) this.nodeRenderer.mesh.visible = !!this.state.showNodes;
    if (this.dom.labelsLayer) this.dom.labelsLayer.style.display = this.state.showLabels ? '' : 'none';
    this.sceneController.render();
  }

  getCurrentLayerPayload() {
    const style = getStylePreset(this.dom.stylePreset.value);
    const layer = this.state.displayLayer;
    if (layer === 'skeleton' && this.state.skeletonPolylines.length) {
      return {
        name: 'skeleton',
        polylines: this.state.skeletonPolylines,
        lookup: this.state.skeletonPolylines.map((_, i) => i),
        colors: this.state.skeletonPolylines.map(() => new THREE.Color(style.edgeEnd)),
        opacity: Math.min(1, (Number(this.dom.edgeOpacity.value) || style.edgeOpacity) + 0.18)
      };
    }
    if (layer === 'bundle' && this.state.bundlePolylines.length) {
      return {
        name: 'bundle',
        polylines: this.state.bundlePolylines,
        lookup: this.state.bundleEdgeLookup,
        colors: this.state.bundleEdgeLookup.map((edgeIndex) => this.state.edgeColors[edgeIndex] || new THREE.Color(style.edgeStart)),
        opacity: Number(this.dom.edgeOpacity.value) || style.edgeOpacity
      };
    }
    if (layer === 'fabrication' && this.fabricationGroup) {
      return {
        name: 'fabrication',
        polylines: [],
        lookup: [],
        colors: [],
        opacity: Number(this.dom.edgeOpacity.value) || style.edgeOpacity
      };
    }
    return {
      name: 'raw',
      polylines: this.state.rawPolylines,
      lookup: this.state.rawEdgeLookup,
      colors: this.state.rawEdgeLookup.map((edgeIndex) => this.state.edgeColors[edgeIndex] || new THREE.Color(style.edgeStart)),
      opacity: Number(this.dom.edgeOpacity.value) || style.edgeOpacity
    };
  }

  refreshVisibleLayer() {
    const graph = this.state.graph;
    if (!graph) return;
    this.state.displayLayer = this.dom.displayLayer.value;
    this.syncViewPositionsForStage(this.state.displayLayer || 'raw');
    this.rebuildRawLayer();
    const layer = this.getCurrentLayerPayload();
    const { focusSet, focusEdgeSet } = this.getFocusContext();
    const emphasisMask = layer.lookup.map((edgeIndex) => focusEdgeSet.has(edgeIndex));

    if (layer.name === 'fabrication' && this.fabricationGroup) {
      this.edgeRenderer.clear();
      this.setSolidPreview(null);
      this.fabricationGroup.visible = !!this.state.showGeometry;
    } else {
      if (this.fabricationGroup) this.fabricationGroup.visible = false;
      this.edgeRenderer.drawPolylines({
        polylines: layer.polylines,
        colors: layer.colors,
        opacity: layer.opacity,
        emphasisMask,
        dimOpacity: 0.1,
        focusOpacity: focusEdgeSet.size ? 1 : layer.opacity
      });
      this.edgeRenderer.group.visible = !!this.state.showGeometry;
      this.buildSolidPreview(layer);
    }

    this.labelRenderer.update({
      labelsEnabled: this.state.showLabels && (Number(this.dom.labelCount.value) || 0) > 0,
      count: Number(this.dom.labelCount.value) || 0,
      fontSize: 12,
      nodes: graph.nodes,
      positions: this.state.positions3D,
      metrics: graph.metrics,
      camera: this.sceneController.camera,
      viewportWidth: this.dom.viewport.clientWidth,
      viewportHeight: this.dom.viewport.clientHeight,
      background: this.dom.backgroundColor?.value || getStylePreset(this.dom.stylePreset.value).background,
      visibleMask: this.state.visibleMask,
      focusIndexes: Array.from(focusSet)
    });

    if (this.dom.labelsLayer) this.dom.labelsLayer.style.display = this.state.showLabels ? '' : 'none';
    this.updateMetricsPanel(layer);
    this.updateLayerPanel(layer);
    this.syncQuickSceneTools();
    this.renderLayerAvailability();
    this.sceneController.render();
  }

  buildSolidPreview(layer) {
    const enabled = !!this.dom.solidPreview?.checked;
    if (!enabled || !layer.polylines.length) {
      this.setSolidPreview(null);
      return;
    }
    const quality = getQualityPreset(this.state.quality);
    const styleKey = this.dom.stylePreset.value;
    const style = getStylePreset(styleKey);
    const preview = buildPolylineMeshGroup(layer.polylines, {
      radius: Number(this.dom.solidRadius.value) || 0.34,
      taper: Number(this.dom.solidTaper.value) || 0.08,
      materialMode: style.solidMaterial,
      color: style.edgeEnd,
      opacity: Math.min(0.98, Math.max(0.16, Number(this.dom.edgeOpacity.value) || style.edgeOpacity)),
      maxSegments: quality.solidPreviewSegments,
      maxCurves: quality.solidPreviewCurves,
      closedEnds: false,
      addJointSpheres: false
    });
    this.setSolidPreview(preview);
  }

  setSolidPreview(group) {
    if (this.solidPreviewGroup) {
      this.sceneController.scene.remove(this.solidPreviewGroup);
      this.solidPreviewGroup.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
      this.solidPreviewGroup = null;
    }
    if (group) {
      this.solidPreviewGroup = group;
      this.solidPreviewGroup.visible = !!this.state.showGeometry;
      this.sceneController.scene.add(group);
    }
  }

  fitScene() {
    const positions = this.state.positions3D?.length ? this.state.positions3D : [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 80 }];
    this.sceneController.fitToPositions(positions);
  }

  updateOverview() {
    const graph = this.state.graph;
    if (!graph) return;
    const visibleNodes = this.state.visibleMask.filter(Boolean).length;
    const visibleEdges = this.state.rawPolylines.length;
    this.dom.overviewStats.innerHTML = `
      <div><strong>${htmlEscape(this.state.graphName)}</strong></div>
      <div>Nodes: ${graph.nodes.length.toLocaleString()} · Visible: ${visibleNodes.toLocaleString()}</div>
      <div>Edges: ${graph.edges.length.toLocaleString()} · Drawn: ${visibleEdges.toLocaleString()}</div>
      <div>Quality: ${htmlEscape(this.state.quality)} · Active method: ${htmlEscape(getMethodById(this.state.activeMethod).name)}</div>
    `;
    this.dom.statusStats.textContent = `Nodes: ${graph.nodes.length.toLocaleString()} · Edges: ${graph.edges.length.toLocaleString()} · Layer: ${this.state.displayLayer}`;
  }

  updateSelectionPanel() {
    const graph = this.state.graph;
    if (!graph) return;
    if (this.state.selectedNodeIndex == null) {
      const hovered = this.state.hoveredNodeIndex;
      if (hovered == null) {
        this.dom.selectionContent.innerHTML = 'Hover or click a node to inspect metadata.';
      } else {
        const node = graph.nodes[hovered];
        this.dom.selectionContent.innerHTML = summarizeNode(node);
      }
      return;
    }
    const node = graph.nodes[this.state.selectedNodeIndex];
    const degree = graph.metrics.degree[this.state.selectedNodeIndex] || 0;
    const weighted = graph.metrics.weightedDegree[this.state.selectedNodeIndex] || 0;
    const neighbors = (graph.metrics.neighbors[this.state.selectedNodeIndex] || []).slice(0, 8).map((i) => graph.nodes[i]?.label || graph.nodes[i]?.id).filter(Boolean);
    this.dom.selectionContent.innerHTML = `
      ${summarizeNode(node)}
      <div class="top-gap small"><strong>Degree</strong>: ${formatNumber(degree, 0)} · <strong>Weighted</strong>: ${formatNumber(weighted)}</div>
      <div class="top-gap small"><strong>Neighbors</strong>: ${neighbors.length ? htmlEscape(neighbors.join(', ')) : 'None'}</div>
    `;
  }

  updateMetricsPanel(layer = this.getCurrentLayerPayload()) {
    const metrics = layer.name === 'bundle' && this.state.bundleMetrics ? this.state.bundleMetrics : metricsFromPolylines(this.state.graph, layer.polylines, layer.lookup);
    const runtime = layer.name === 'bundle' ? this.state.bundleRuntimeMs : 0;
    this.dom.bundleMetrics.innerHTML = `
      <div><strong>Layer</strong>: ${htmlEscape(layer.name)}</div>
      <div><strong>Visible curves</strong>: ${layer.polylines.length.toLocaleString()}</div>
      <div><strong>Average inflation</strong>: ${formatNumber(metrics.averageInflation)}</div>
      <div><strong>Max inflation</strong>: ${formatNumber(metrics.maxInflation)}</div>
      <div><strong>Compactness</strong>: ${formatNumber(metrics.compactness)}</div>
      <div><strong>Average turn</strong>: ${formatNumber(metrics.averageTurn)}</div>
      ${runtime ? `<div><strong>Worker runtime</strong>: ${formatNumber(runtime)} ms</div>` : ''}
    `;
  }

  updateLayerPanel(layer = this.getCurrentLayerPayload()) {
    const lines = [];
    const available = this.computeAvailableLayers();
    lines.push(`<div><strong>Display</strong>: ${htmlEscape(layer.name)}</div>`);
    lines.push(`<div><strong>Solid preview</strong>: ${this.dom.solidPreview?.checked ? 'on' : 'off'}</div>`);
    lines.push(`<div><strong>Visibility</strong>: nodes ${this.state.showNodes ? 'on' : 'off'} · labels ${this.state.showLabels ? 'on' : 'off'} · geometry ${this.state.showGeometry ? 'on' : 'off'}</div>`);
    lines.push(`<div><strong>Available states</strong>: raw ${available.raw ? '✓' : '—'} · bundle ${available.bundle ? '✓' : '—'} · skeleton ${available.skeleton ? '✓' : '—'} · fabrication ${available.fabrication ? '✓' : '—'}</div>`);
    if (this.state.skeletonStats) {
      lines.push(`<div><strong>Skeleton branches</strong>: ${formatNumber(this.state.skeletonStats.branches, 0)}</div>`);
      lines.push(`<div><strong>Avg branch length</strong>: ${formatNumber(this.state.skeletonStats.averageBranchLength)}</div>`);
    }
    if (this.state.fabricationInfo) {
      lines.push(`<div><strong>Fabrication segments</strong>: ${formatNumber(this.state.fabricationInfo.totalSegments, 0)}</div>`);
    }
    this.dom.layerContent.innerHTML = lines.join('');
  }

  async runSelectedBundling() {
    if (!this.state.graph) return;
    const methodId = this.state.activeMethod;
    await this.computeBundling(methodId, { applyToScene: true });
    this.dom.displayLayer.value = 'bundle';
    this.state.displayLayer = 'bundle';
    this.refreshVisibleLayer();
  }

  currentBundlingParams() {
    return {
      samples: Number(this.dom.bundleSamples.value) || 16,
      iterations: Number(this.dom.bundleIterations.value) || 8,
      strength: Number(this.dom.bundleStrength.value) || 0.58,
      lift: Number(this.dom.bundleLift.value) || 1.4,
      clusterCount: Number(this.dom.bundleClusterCount.value) || 12,
      hubCount: Number(this.dom.bundleHubCount.value) || 10,
      detourCap: Number(this.dom.bundleDetour.value) || 2.4,
      exponent: Number(this.dom.bundleExponent.value) || 2.6,
      directionSplit: Number(this.dom.directionSplit.value) || 3.5,
      grid: Number(this.dom.bundleGrid.value) || getQualityPreset(this.state.quality).grid,
      layerAttr: this.dom.layerAttr.value,
      layerGap: Number(this.dom.layerGap.value) || 14
    };
  }

  bundlingCacheKey(methodId) {
    return JSON.stringify({
      methodId,
      layoutVersion: this.state.layoutVersion,
      quality: this.state.quality,
      visibleEdges: this.state.rawEdgeLookup,
      params: this.currentBundlingParams()
    });
  }

  async computeBundling(methodId, { applyToScene = false } = {}) {
    const graph = this.state.graph;
    if (!graph) return { polylines: [], edgeIndexes: [], runtimeMs: 0, metrics: null };

    const cacheKey = this.bundlingCacheKey(methodId);
    if (this.state.bundleCache.has(cacheKey)) {
      const cached = this.state.bundleCache.get(cacheKey);
      if (applyToScene) {
        this.state.bundlePolylines = cached.polylines;
        this.state.bundleEdgeLookup = cached.edgeIndexes;
        this.state.bundleRuntimeMs = cached.runtimeMs;
        this.state.bundleMetrics = cached.metrics;
      }
      return cached;
    }

    const params = this.currentBundlingParams();
    const method = getMethodById(methodId);
    this.setProgress(`Bundling with ${method.name}…`, 0, true);
    const worker = new Worker(new URL('./workers/studioBundleWorker.js', import.meta.url), { type: 'module' });
    const payload = {
      nodes: this.state.positions3D,
      edges: graph.edges.map((edge) => ({ sourceIndex: edge.sourceIndex, targetIndex: edge.targetIndex, weight: edge.weight || 1 })),
      edgeIndexes: this.state.rawEdgeLookup,
      algorithm: methodId,
      samples: params.samples,
      hubCount: params.hubCount,
      lift: params.lift,
      detourCap: params.detourCap,
      exponent: params.exponent,
      degree: graph.metrics.degree,
      strength: params.strength,
      iterations: params.iterations,
      clusterCount: params.clusterCount,
      directionSplit: params.directionSplit,
      layerValues: params.layerAttr ? graph.nodes.map((node) => node.attrs?.[params.layerAttr] ?? node[params.layerAttr] ?? 'missing') : [],
      layerGap: params.layerGap,
      grid: params.grid,
      excludeDirect: false
    };

    const result = await new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.type === 'progress') this.setProgress(`Bundling with ${method.name}…`, data.percent ?? 0, true);
        if (data.type === 'result') resolve(data);
        if (data.type === 'error') reject(new Error(data.message || 'Bundling failed.'));
      };
      worker.onerror = (error) => reject(error);
      worker.postMessage(payload);
    }).finally(() => worker.terminate());

    const metrics = metricsFromPolylines(graph, result.polylines, result.edgeIndexes);
    const packaged = {
      polylines: result.polylines,
      edgeIndexes: result.edgeIndexes,
      runtimeMs: result.runtimeMs,
      metrics
    };
    this.state.bundleCache.set(cacheKey, packaged);

    if (applyToScene) {
      this.state.bundlePolylines = packaged.polylines;
      this.state.bundleEdgeLookup = packaged.edgeIndexes;
      this.state.bundleRuntimeMs = packaged.runtimeMs;
      this.state.bundleMetrics = packaged.metrics;
      this.updateStatus(`Computed ${method.name}.`, `Visible bundled curves: ${packaged.polylines.length.toLocaleString()} · Runtime: ${formatNumber(packaged.runtimeMs)} ms`);
    }
    this.setProgress('', 0, false);
    return packaged;
  }

  runSkeletonExtraction() {
    if (!this.state.graph) return;
    const sourcePolylines = this.state.bundlePolylines.length ? this.state.bundlePolylines : this.state.rawPolylines;
    const extraction = extractDensitySkeleton(sourcePolylines, {
      grid: Number(this.dom.skeletonGrid.value) || 84,
      threshold: Number(this.dom.skeletonThreshold.value) || 3,
      simplify: Number(this.dom.skeletonSimplify.value) || 1.2,
      minBranchLength: Number(this.dom.skeletonMinBranch.value) || 4
    });
    this.state.skeletonPolylines = extraction.polylines;
    this.state.skeletonStats = extraction.stats;
    this.dom.skeletonStats.innerHTML = `
      <div><strong>Branches</strong>: ${formatNumber(extraction.stats.branches, 0)}</div>
      <div><strong>Occupied cells</strong>: ${formatNumber(extraction.stats.occupied, 0)}</div>
      <div><strong>Avg branch length</strong>: ${formatNumber(extraction.stats.averageBranchLength)}</div>
    `;
    this.dom.displayLayer.value = 'skeleton';
    this.state.displayLayer = 'skeleton';
    this.refreshVisibleLayer();
    this.updateStatus('Extracted centerline skeleton.');
  }

  buildFabricationPreview() {
    if (!this.state.graph) return;
    const source = this.dom.fabricationSource.value;
    let polylines = this.state.bundlePolylines;
    if (source === 'skeleton') polylines = this.state.skeletonPolylines;
    else if (source === 'raw') polylines = this.state.rawPolylines;

    if (!polylines.length) {
      this.updateStatus(`No ${source} geometry is available for fabrication.`);
      return;
    }

    const style = getStylePreset(this.dom.stylePreset.value);
    const fabricationNodes = this.buildFabricationNodeDescriptors();
    const group = buildFabricationGroup(polylines, fabricationNodes.nodes, {
      radius: Number(this.dom.fabricationRadius.value) || 0.5,
      taper: Number(this.dom.solidTaper.value) || 0.08,
      addBasePlate: this.dom.addBasePlate.checked,
      addPedestal: this.dom.addPedestal.checked,
      nodeConnectorScale: Number(this.dom.nodeConnectorScale.value) || 1.6,
      nodeShape: this.dom.nodeShapeConstant?.value || 'sphere',
      materialMode: getStylePreset(this.dom.stylePreset.value).solidMaterial,
      color: style.edgeEnd,
      opacity: 0.98,
      normalizeWidth: Number(this.dom.fabricationWidth.value) || 180,
      wallRelief: this.dom.wallRelief.checked,
      reliefDepth: Number(this.dom.reliefDepth.value) || 18
    });

    if (this.fabricationGroup) {
      this.sceneController.scene.remove(this.fabricationGroup);
      this.fabricationGroup.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
    }
    this.fabricationGroup = group;
    this.sceneController.scene.add(group);

    this.state.fabricationInfo = evaluatePrintability(polylines, {
      radius: Number(this.dom.fabricationRadius.value) || 0.5,
      minPrintableRadius: 0.4
    });
    this.dom.printabilityPanel.innerHTML = `
      <div><strong>Longest segment</strong>: ${formatNumber(this.state.fabricationInfo.longestSegment)}</div>
      <div><strong>Total segments</strong>: ${formatNumber(this.state.fabricationInfo.totalSegments, 0)}</div>
      <div><strong>Visible node solids</strong>: ${formatNumber(fabricationNodes.nodes.length, 0)}</div>
      ${fabricationNodes.mappingHtml}
      <div class="top-gap">${this.state.fabricationInfo.warnings.map((w) => `<div>• ${htmlEscape(w)}</div>`).join('')}</div>
    `;
    this.dom.displayLayer.value = 'fabrication';
    this.state.displayLayer = 'fabrication';
    this.refreshVisibleLayer();
    this.updateStatus('Fabrication preview built.');
  }

  clearFabricationPreview(updatePanel = true) {
    if (this.fabricationGroup) {
      this.sceneController.scene.remove(this.fabricationGroup);
      this.fabricationGroup.traverse((obj) => {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      });
      this.fabricationGroup = null;
    }
    this.state.fabricationInfo = null;
    if (updatePanel) this.dom.printabilityPanel.innerHTML = 'Fabrication preview cleared.';
    if (this.state.displayLayer === 'fabrication') {
      this.dom.displayLayer.value = this.state.bundlePolylines.length ? 'bundle' : 'raw';
      this.state.displayLayer = this.dom.displayLayer.value;
      this.refreshVisibleLayer();
    }
  }

  async exportFabrication(format) {
    if (!this.fabricationGroup) {
      this.updateStatus('Build a fabrication preview before exporting STL / OBJ / GLB.');
      return;
    }
    const blob = await exportGroup(this.fabricationGroup, format);
    downloadBlob(blob, `${this.safeFileStem()}-fabrication.${format}`);
  }

  async runComparisonBoard() {
    if (!this.state.graph) return;
    const left = this.dom.compareLeft.value;
    const right = this.dom.compareRight.value;
    this.setProgress('Generating comparison board…', 0, true);
    const leftResult = await this.computeBundling(left, { applyToScene: false });
    this.setProgress('Generating comparison board…', 55, true);
    const rightResult = await this.computeBundling(right, { applyToScene: false });
    this.setProgress('', 0, false);

    const style = getStylePreset(this.dom.stylePreset.value);
    const leftSvg = buildPreviewSvg(leftResult.polylines, {
      background: style.background,
      stroke: style.edgeStart,
      strokeOpacity: 0.44
    });
    const rightSvg = buildPreviewSvg(rightResult.polylines, {
      background: style.background,
      stroke: style.edgeEnd,
      strokeOpacity: 0.44
    });

    const renderCard = (methodId, result, svgText) => {
      const method = getMethodById(methodId);
      const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
      return `
        <article class="compare-card">
          <div class="compare-card-head">
            <div>
              <div class="eyebrow">${htmlEscape(method.family)}</div>
              <h3>${htmlEscape(method.name)}</h3>
            </div>
            <div class="chip">${formatNumber(result.runtimeMs)} ms</div>
          </div>
          <img src="${uri}" alt="${htmlEscape(method.name)} preview" />
          <div class="compare-metrics">
            <div>Inflation: ${formatNumber(result.metrics.averageInflation)}</div>
            <div>Compactness: ${formatNumber(result.metrics.compactness)}</div>
            <div>Turn: ${formatNumber(result.metrics.averageTurn)}</div>
          </div>
        </article>
      `;
    };

    this.dom.compareBoard.innerHTML = renderCard(left, leftResult, leftSvg) + renderCard(right, rightResult, rightSvg);
    this.dom.rightRail?.classList.remove('collapsed');
    this.dom.workspace?.classList.remove('right-collapsed');
    this.updateStatus(`Comparison generated for ${getMethodById(left).name} and ${getMethodById(right).name}.`);
  }

  applyStylePresetUi(presetOnly = false) {
    const style = getStylePreset(this.dom.stylePreset.value);
    if (!presetOnly) this.dom.edgeOpacity.value = style.edgeOpacity;
    if (this.dom.backgroundColor) this.dom.backgroundColor.value = style.background;
    document.documentElement.style.setProperty('--studio-bg', this.dom.backgroundColor?.value || style.background);
    this.syncQuickSceneTools();
  }

  setCameraPreset(kind) {
    const positions = this.state.positions3D;
    if (!positions?.length) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    positions.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z || 0); maxZ = Math.max(maxZ, p.z || 0);
    });
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const target = this.sceneController.controls.target;
    target.set(cx, cy, cz);
    if (kind === 'top') this.sceneController.camera.position.set(cx, cy, cz + span * 2.5 + 10);
    else if (kind === 'side') this.sceneController.camera.position.set(cx + span * 2.5 + 10, cy, cz);
    else this.sceneController.camera.position.set(cx + span * 1.6, cy + span * 1.1, cz + span * 1.8);
    this.sceneController.camera.lookAt(target);
    this.sceneController.controls.update();
    this.sceneController.render();
  }

  savePreset() {
    const name = (this.dom.presetName.value || '').trim();
    if (!name) {
      this.updateStatus('Enter a preset name first.');
      return;
    }
    const presets = this.readPresets();
    presets[name] = this.capturePresetState();
    localStorage.setItem(this.presetStorageKey, JSON.stringify(presets));
    this.refreshPresetSelect(name);
    this.updateStatus(`Saved preset “${name}”.`);
  }

  loadPreset() {
    const name = this.dom.savedPresetSelect.value;
    if (!name) return;
    const presets = this.readPresets();
    const preset = presets[name];
    if (!preset) return;
    this.applyPresetState(preset);
    this.updateStatus(`Loaded preset “${name}”.`);
  }

  deletePreset() {
    const name = this.dom.savedPresetSelect.value;
    if (!name) return;
    const presets = this.readPresets();
    delete presets[name];
    localStorage.setItem(this.presetStorageKey, JSON.stringify(presets));
    this.refreshPresetSelect();
    this.updateStatus(`Deleted preset “${name}”.`);
  }

  readPresets() {
    try {
      return JSON.parse(localStorage.getItem(this.presetStorageKey) || '{}');
    } catch {
      return {};
    }
  }

  refreshPresetSelect(selected = '') {
    const names = Object.keys(this.readPresets()).sort((a, b) => a.localeCompare(b));
    setOptions(this.dom.savedPresetSelect, names, { includeBlank: true, selected });
  }

  capturePresetState() {
    return {
      ui: {
        stylePreset: this.dom.stylePreset.value,
        solidPreview: this.dom.solidPreview.checked,
        edgeOpacity: this.dom.edgeOpacity.value,
        solidRadius: this.dom.solidRadius.value,
        solidTaper: this.dom.solidTaper.value,
        nodeSizeMode: this.dom.nodeSizeMode.value,
        sizeAttr: this.dom.sizeAttr.value,
        nodeColorMode: this.dom.nodeColorMode.value,
        colorAttr: this.dom.colorAttr.value,
        edgeColorMode: this.dom.edgeColorMode.value,
        constantNodeColor: this.dom.constantNodeColor.value,
        backgroundColor: this.dom.backgroundColor?.value,
        focusDim: this.dom.focusDim?.value,
        displayLayer: this.dom.displayLayer.value,
        fabricationSource: this.dom.fabricationSource?.value,
        fabricationRadius: this.dom.fabricationRadius?.value,
        fabricationWidth: this.dom.fabricationWidth?.value,
        nodeConnectorScale: this.dom.nodeConnectorScale?.value,
        nodeShapeMode: this.dom.nodeShapeMode?.value,
        nodeShapeConstant: this.dom.nodeShapeConstant?.value,
        nodeShapeAttr: this.dom.nodeShapeAttr?.value,
        reliefDepth: this.dom.reliefDepth?.value,
        addBasePlate: this.dom.addBasePlate?.checked,
        addPedestal: this.dom.addPedestal?.checked,
        wallRelief: this.dom.wallRelief?.checked,
        uiTheme: this.state.uiTheme,
        currentMode: this.state.currentMode
      },
      camera: {
        position: this.sceneController.camera.position.toArray(),
        target: this.sceneController.controls.target.toArray()
      }
    };
  }

  applyPresetState(preset) {
    if (preset?.ui) {
      Object.entries(preset.ui).forEach(([key, value]) => {
        const el = this.dom[key];
        if (el != null) {
          if (el.type === 'checkbox') el.checked = !!value;
          else el.value = value;
        }
      });
    }
    if (preset?.camera?.position && preset?.camera?.target) {
      this.sceneController.camera.position.fromArray(preset.camera.position);
      this.sceneController.controls.target.fromArray(preset.camera.target);
      this.sceneController.controls.update();
    }
    if (preset?.ui?.currentMode) this.setMode(preset.ui.currentMode);
    this.updateFabricationShapeControls();
    this.applyStylePresetUi();
    this.state.displayLayer = this.dom.displayLayer.value;
    if (preset?.ui?.uiTheme) this.applyUiTheme(preset.ui.uiTheme);
    this.refreshEncodingsAndLayers();
  }

  exportPng() {
    const dataUrl = this.sceneController.exportPng({ scale: this.state.quality === 'export' ? 2.5 : 2, transparent: true });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${this.safeFileStem()}.png`;
    a.click();
  }

  exportSvg() {
    if (!this.state.graph) return;
    const viewport = this.sceneController.getViewportSize();
    const svg = buildSceneSvg({
      camera: this.sceneController.camera,
      width: viewport.width,
      height: viewport.height,
      background: this.dom.backgroundColor?.value || getStylePreset(this.dom.stylePreset.value).background,
      transparent: false,
      positions: this.state.positions3D,
      sizes: this.state.nodeSizes,
      nodeColors: this.state.nodeColors,
      polylines: this.edgeRenderer.lastDraw.polylines,
      edgeColors: this.edgeRenderer.lastDraw.colors,
      edgeOpacity: this.edgeRenderer.lastDraw.opacity,
      labels: this.labelRenderer.exportLabels(this.state.graph.nodes, this.state.positions3D)
    });
    downloadText(svg, `${this.safeFileStem()}.svg`, 'image/svg+xml;charset=utf-8');
  }

  exportState() {
    if (!this.state.graph) return;
    const text = serializeStudioState({
      graphName: this.state.graphName,
      activeMethod: this.state.activeMethod,
      quality: this.state.quality,
      displayLayer: this.state.displayLayer,
      positions2D: this.state.positions2D,
      positions3D: this.state.positions3D,
      mappedPositions3D: this.state.mappedPositions3D,
      rawEdgeLookup: this.state.rawEdgeLookup,
      bundleEdgeLookup: this.state.bundleEdgeLookup,
      bundleMetrics: this.state.bundleMetrics,
      skeletonStats: this.state.skeletonStats,
      ui: this.capturePresetState().ui
    });
    downloadText(text, `${this.safeFileStem()}-state.json`);
  }

  safeFileStem() {
    return String(this.state.graphName || 'network-studio')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'network-studio';
  }

  onRenderFrame() {
    if (this.state.graph) {
      this.labelRenderer.project(this.state.positions3D, this.sceneController.camera, this.dom.viewport.clientWidth, this.dom.viewport.clientHeight);
    }
  }

  pointerFromEvent(event) {
    const rect = this.dom.viewport.getBoundingClientRect();
    this.pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return rect;
  }

  pickNodeIndex(event) {
    if (!this.state.graph || !this.state.positions3D?.length || !this.state.showNodes) return null;
    const rect = this.pointerFromEvent(event);
    const graph = this.state.graph;
    let bestIndex = null;
    let bestScore = Infinity;
    for (let i = 0; i < graph.nodes.length; i += 1) {
      if (!this.state.visibleMask[i]) continue;
      const pos = this.state.positions3D[i];
      if (!pos) continue;
      const projected = new THREE.Vector3(pos.x, pos.y, pos.z || 0).project(this.sceneController.camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const sx = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
      const sy = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
      const dx = event.clientX - sx;
      const dy = event.clientY - sy;
      const dist2 = dx * dx + dy * dy;
      const radius = Math.max(8, Math.min(30, (Number(this.state.nodeSizes[i]) || 1) * 4.5));
      if (dist2 <= radius * radius && dist2 < bestScore) {
        bestScore = dist2;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  handlePointerDown(event) {
    if (this.state.currentMode === 'load2d' && this.state.displayLayer !== 'raw') {
      this.dom.displayLayer.value = 'raw';
      this.state.displayLayer = 'raw';
      this.refreshVisibleLayer();
    }
    const picked = this.pickNodeIndex(event);
    const canDrag = this.state.currentMode === 'load2d' && this.state.displayLayer === 'raw' && picked != null && event.button === 0;
    if (canDrag) {
      const current = this.state.positions3D[picked] || this.state.positions2D[picked];
      this.raycaster.setFromCamera(this.pointerNdc, this.sceneController.camera);
      this.dragPlane.constant = -(Number(current?.z) || 0);
      this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHit);
      this.state.dragState = {
        nodeIndex: picked,
        offsetX: (current?.x || 0) - this.dragHit.x,
        offsetY: (current?.y || 0) - this.dragHit.y,
        moved: false
      };
      this.sceneController.controls.enabled = false;
      event.preventDefault();
      return;
    }
    this.state.dragState = { pointerOnly: true, moved: false, x: event.clientX, y: event.clientY };
  }

  handlePointerMove(event) {
    if (!this.state.graph || !this.nodeRenderer.mesh) return;

    if (this.state.dragState && !this.state.dragState.pointerOnly) {
      this.pointerFromEvent(event);
      this.raycaster.setFromCamera(this.pointerNdc, this.sceneController.camera);
      if (this.raycaster.ray.intersectPlane(this.dragPlane, this.dragHit)) {
        const index = this.state.dragState.nodeIndex;
        const nextX = this.dragHit.x + this.state.dragState.offsetX;
        const nextY = this.dragHit.y + this.state.dragState.offsetY;
        this.state.positions2D[index] = { ...(this.state.positions2D[index] || {}), x: nextX, y: nextY, z: 0 };
        if (this.state.positions3D[index]) {
          this.state.positions3D[index] = { ...this.state.positions3D[index], x: nextX, y: nextY };
        }
        this.state.dragState.moved = true;

        const quality = getQualityPreset(this.state.quality || this.dom.qualityMode.value);
        const raw = buildRawPolylines(this.state.graph, this.state.positions3D, this.state.visibleMask, quality.maxEdges);
        this.state.rawPolylines = raw.map((entry) => entry.points);
        this.state.rawEdgeLookup = raw.map((entry) => entry.edgeIndex);
        this.dom.displayLayer.value = 'raw';
        this.state.displayLayer = 'raw';
        this.renderNodes();
        this.refreshVisibleLayer();
        this.updateOverview();
        this.updateStatus(`Dragging node ${this.state.graph.nodes[index].label || this.state.graph.nodes[index].id}. Bundles are temporarily hidden until you release the node.`);
      }
      return;
    }

    if (this.state.dragState?.pointerOnly) {
      const moved = Math.hypot(event.clientX - this.state.dragState.x, event.clientY - this.state.dragState.y);
      if (moved > 4) this.state.dragState.moved = true;
    }

    const picked = this.pickNodeIndex(event);
    if (picked == null) {
      this.clearHover();
      return;
    }
    this.state.hoveredNodeIndex = picked;
    const node = this.state.graph.nodes[picked];
    this.dom.tooltip.innerHTML = `<strong>${htmlEscape(node.label || node.id)}</strong>`;
    this.dom.tooltip.style.left = `${event.clientX + 14}px`;
    this.dom.tooltip.style.top = `${event.clientY + 14}px`;
    this.dom.tooltip.classList.remove('hidden');
    if (this.state.selectedNodeIndex == null) this.updateSelectionPanel();
  }

  handlePointerUp() {
    if (this.state.dragState && !this.state.dragState.pointerOnly) {
      const index = this.state.dragState.nodeIndex;
      this.sceneController.controls.enabled = true;
      this.state.dragState = null;
      this.state.suppressClick = true;
      this.state.layoutVersion += 1;
      this.applyDepthMapping();
      this.invalidateDerivedStates({ clearCache: true, clearFabrication: true, switchToRaw: true });
      this.refreshEncodingsAndLayers();
      this.updateStatus(`Moved node ${this.state.graph.nodes[index].label || this.state.graph.nodes[index].id}. Derived bundle, skeleton, and fabrication layers were reset to match the latest edited layout.`);
      return;
    }
    if (this.state.dragState?.pointerOnly && this.state.dragState.moved) this.state.suppressClick = true;
    this.sceneController.controls.enabled = true;
    this.state.dragState = null;
  }

  handlePointerLeave() {
    this.sceneController.controls.enabled = true;
    if (!this.state.dragState || this.state.dragState.pointerOnly) this.clearHover();
  }

  clearHover() {
    this.state.hoveredNodeIndex = null;
    this.dom.tooltip.classList.add('hidden');
    if (this.state.selectedNodeIndex == null) this.updateSelectionPanel();
  }

  commitSelectionFromHover() {
    if (!this.state.graph) return;
    if (this.state.hoveredNodeIndex == null) {
      this.state.selectedNodeIndex = null;
    } else if (this.state.selectedNodeIndex === this.state.hoveredNodeIndex) {
      this.state.selectedNodeIndex = null;
    } else {
      this.state.selectedNodeIndex = this.state.hoveredNodeIndex;
    }
    this.renderNodes();
    this.refreshVisibleLayer();
    this.updateSelectionPanel();
  }
}
