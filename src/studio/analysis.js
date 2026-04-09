import { boundsFromPositions } from '../utils/math.js';
import { categoricalColor, numericRamp, parseLiteralColor, hexToColor } from '../utils/colors.js';
import { dist3, polylineLength, samplePolyline, simplifyPolyline } from './geometry.js';

export const QUALITY_PRESETS = {
  draft: { maxEdges: 1800, sampleCount: 10, grid: 52, solidPreviewCurves: 120, solidPreviewSegments: 900 },
  interactive: { maxEdges: 5000, sampleCount: 14, grid: 72, solidPreviewCurves: 240, solidPreviewSegments: 1800 },
  high: { maxEdges: 12000, sampleCount: 18, grid: 96, solidPreviewCurves: 480, solidPreviewSegments: 3200 },
  export: { maxEdges: 22000, sampleCount: 28, grid: 128, solidPreviewCurves: 900, solidPreviewSegments: 7200 }
};

export const STYLE_PRESETS = {
  'scientific-dark': {
    name: 'Scientific dark studio',
    background: '#07111f',
    edgeOpacity: 0.30,
    nodeColor: '#86b7ff',
    edgeStart: '#7ec2ff',
    edgeEnd: '#ffd39a',
    labelColor: '#eef5ff',
    solidMaterial: 'matte'
  },
  'monochrome-print': {
    name: 'Monochrome print preview',
    background: '#f2f1ed',
    edgeOpacity: 0.7,
    nodeColor: '#30343f',
    edgeStart: '#222222',
    edgeEnd: '#777777',
    labelColor: '#111111',
    solidMaterial: 'matte'
  },
  'metallic-sculpture': {
    name: 'Metallic sculpture',
    background: '#101010',
    edgeOpacity: 0.45,
    nodeColor: '#b89b68',
    edgeStart: '#8b6f47',
    edgeEnd: '#d8c08f',
    labelColor: '#f5e9c8',
    solidMaterial: 'metal'
  },
  'glass-fiber': {
    name: 'Glass fiber',
    background: '#041118',
    edgeOpacity: 0.24,
    nodeColor: '#8ce8ff',
    edgeStart: '#4ed9ff',
    edgeEnd: '#d1fbff',
    labelColor: '#dffbff',
    solidMaterial: 'glass'
  },
  'neon-flow': {
    name: 'Neon flow',
    background: '#04030b',
    edgeOpacity: 0.33,
    nodeColor: '#ff8ac7',
    edgeStart: '#7c72ff',
    edgeEnd: '#00ffd9',
    labelColor: '#ffffff',
    solidMaterial: 'neon'
  },
  'museum-artifact': {
    name: 'Museum artifact',
    background: '#1a1713',
    edgeOpacity: 0.42,
    nodeColor: '#d1b99b',
    edgeStart: '#876b4e',
    edgeEnd: '#c6a17a',
    labelColor: '#f7ead6',
    solidMaterial: 'clay'
  },
  'technical-blueprint': {
    name: 'Technical blueprint',
    background: '#0b2451',
    edgeOpacity: 0.32,
    nodeColor: '#d4ebff',
    edgeStart: '#6ed0ff',
    edgeEnd: '#e8fbff',
    labelColor: '#f2fbff',
    solidMaterial: 'blueprint'
  }
};

export function getQualityPreset(key) {
  return QUALITY_PRESETS[key] || QUALITY_PRESETS.interactive;
}

export function getStylePreset(key) {
  return STYLE_PRESETS[key] || STYLE_PRESETS['scientific-dark'];
}

export function getNodeSizes(graph, sizeMode = 'degree', sizeAttr = '', constantSize = 1.4) {
  const degree = graph.metrics.degree;
  const weighted = graph.metrics.weightedDegree;
  const attrValues = sizeAttr ? graph.nodes.map((n) => Number(n.attrs?.[sizeAttr] ?? n[sizeAttr])) : [];
  const finiteAttr = attrValues.filter(Number.isFinite);
  const minAttr = finiteAttr.length ? Math.min(...finiteAttr) : 0;
  const maxAttr = finiteAttr.length ? Math.max(...finiteAttr) : 1;

  return graph.nodes.map((node, index) => {
    if (sizeMode === 'original') return Math.max(0.8, Number(node.size) || constantSize);
    if (sizeMode === 'weighted') return 0.9 + Math.sqrt(weighted[index] || 0) * 0.28;
    if (sizeMode === 'attribute' && sizeAttr) {
      const value = Number(node.attrs?.[sizeAttr] ?? node[sizeAttr]);
      const t = Number.isFinite(value) ? (value - minAttr) / ((maxAttr - minAttr) || 1) : 0.35;
      return 0.8 + Math.max(0, Math.min(1, t)) * 3.4;
    }
    if (sizeMode === 'constant') return constantSize;
    return 1 + Math.sqrt(degree[index] || 0) * 0.35;
  });
}

export function getNodeColors(graph, options = {}) {
  const {
    colorMode = 'attribute',
    colorAttr = '',
    constantColor = '#86b7ff',
    rampStart = '#7ec2ff',
    rampEnd = '#ffd39a'
  } = options;

  const attrValues = colorAttr ? graph.nodes.map((n) => n.attrs?.[colorAttr] ?? n[colorAttr]) : [];
  const numericValues = attrValues.map((value) => Number(value));
  const finite = numericValues.filter(Number.isFinite);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;

  return graph.nodes.map((node, index) => {
    if (colorMode === 'constant') return hexToColor(constantColor);
    if (colorMode === 'original') return parseLiteralColor(node.color) || hexToColor(constantColor);
    if (colorAttr) {
      const raw = attrValues[index];
      const literal = parseLiteralColor(raw);
      if (literal) return literal;
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) return numericRamp(numeric, min, max, rampStart, rampEnd);
      return categoricalColor(raw);
    }
    return hexToColor(constantColor);
  });
}

export function buildVisibleMask(graph, options = {}) {
  const { degreeMin = 0, categoryAttr = '', categoryValue = 'all' } = options;
  return graph.nodes.map((node, index) => {
    if ((graph.metrics.degree[index] || 0) < degreeMin) return false;
    if (categoryAttr && categoryValue && categoryValue !== 'all') {
      const v = node.attrs?.[categoryAttr] ?? node[categoryAttr];
      return String(v) === String(categoryValue);
    }
    return true;
  });
}

export function mapPositionsTo3D(graph, positions2D, options = {}) {
  const {
    mode = 'flat',
    attr = '',
    zScale = 20,
    jitter = 0,
    categoryGap = 12,
    preserveExistingZ = true
  } = options;

  const values = attr ? graph.nodes.map((node) => node.attrs?.[attr] ?? node[attr]) : [];
  const numericValues = values.map((v) => Number(v));
  const finite = numericValues.filter(Number.isFinite);
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  const categories = [...new Set(values.map((v) => String(v ?? 'missing')))];
  const categoryIndex = new Map(categories.map((v, i) => [v, i]));

  return positions2D.map((pos, index) => {
    let z = 0;
    if (mode === 'original-z' && preserveExistingZ) z = Number(graph.nodes[index].z) || 0;
    else if (mode === 'degree') z = (graph.metrics.degree[index] || 0) * 0.8;
    else if (mode === 'weighted') z = (graph.metrics.weightedDegree[index] || 0) * 0.3;
    else if (mode === 'attribute' && attr) {
      const numeric = Number(values[index]);
      if (Number.isFinite(numeric)) {
        const t = (numeric - min) / ((max - min) || 1);
        z = (t - 0.5) * zScale * 2;
      } else {
        const layer = categoryIndex.get(String(values[index] ?? 'missing')) || 0;
        z = (layer - (categories.length - 1) / 2) * categoryGap;
      }
    } else if (mode === 'random') z = (Math.random() - 0.5) * zScale;
    z += (Math.random() - 0.5) * jitter;
    return { x: pos.x, y: pos.y, z };
  });
}

export function computeEdgeColors(graph, nodeColors, stylePreset, mode = 'source') {
  return graph.edges.map((edge) => {
    const source = nodeColors[edge.sourceIndex] || hexToColor(stylePreset.edgeStart);
    const target = nodeColors[edge.targetIndex] || hexToColor(stylePreset.edgeEnd);
    if (mode === 'target') return target.clone();
    if (mode === 'weight') {
      const value = Number(edge.weight) || 1;
      return numericRamp(value, 0, Math.max(1, value), stylePreset.edgeStart, stylePreset.edgeEnd);
    }
    if (mode === 'direction') {
      return source.clone().lerp(target, 0.25);
    }
    return source.clone().lerp(target, 0.5);
  });
}

export function metricsFromPolylines(graph, polylines = [], lookup = []) {
  let totalInflation = 0;
  let maxInflation = 0;
  let smoothness = 0;
  let smoothCount = 0;
  let directVisible = 0;

  polylines.forEach((polyline, localIndex) => {
    const edge = graph.edges[lookup[localIndex]];
    if (!edge || polyline.length < 2) return;
    const direct = dist3(polyline[0], polyline[polyline.length - 1]) || dist3(polyline[0], polyline[polyline.length - 1]) || 1;
    const routed = polylineLength(polyline);
    const inflation = routed / Math.max(1e-6, direct);
    totalInflation += inflation;
    maxInflation = Math.max(maxInflation, inflation);
    directVisible += direct;
    for (let i = 1; i < polyline.length - 1; i += 1) {
      const a = polyline[i - 1];
      const b = polyline[i];
      const c = polyline[i + 1];
      const ab = [b.x - a.x, b.y - a.y, (b.z || 0) - (a.z || 0)];
      const bc = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
      const lab = Math.hypot(...ab);
      const lbc = Math.hypot(...bc);
      if (lab < 1e-9 || lbc < 1e-9) continue;
      const cos = Math.max(-1, Math.min(1, (ab[0]*bc[0] + ab[1]*bc[1] + ab[2]*bc[2]) / (lab * lbc)));
      smoothness += Math.acos(cos);
      smoothCount += 1;
    }
  });

  const compactness = estimateBundleCompactness(polylines);
  return {
    averageInflation: polylines.length ? totalInflation / polylines.length : 1,
    maxInflation,
    compactness,
    averageTurn: smoothCount ? smoothness / smoothCount : 0,
    visibleStraightLength: directVisible
  };
}

export function estimateBundleCompactness(polylines = []) {
  if (!polylines.length) return 0;
  const points = polylines.flatMap((polyline) => samplePolyline(polyline, Math.min(18, Math.max(5, polyline.length))));
  if (!points.length) return 0;
  const bounds = boundsFromPositions(points);
  const grid = 36;
  const map = new Map();
  for (const p of points) {
    const gx = Math.max(0, Math.min(grid - 1, Math.floor(((p.x - bounds.minX) / ((bounds.sizeX || 1))) * (grid - 1))));
    const gy = Math.max(0, Math.min(grid - 1, Math.floor(((p.y - bounds.minY) / ((bounds.sizeY || 1))) * (grid - 1))));
    const key = `${gx}|${gy}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  const occupied = map.size;
  const density = points.length / Math.max(1, occupied);
  return density;
}

export function extractDensitySkeleton(polylines = [], options = {}) {
  const { grid = 84, threshold = 3, simplify = 1.2, minBranchLength = 4 } = options;
  const allPoints = polylines.flatMap((line) => samplePolyline(line, Math.max(6, Math.min(32, line.length * 2))));
  if (!allPoints.length) return { polylines: [], stats: { branches: 0, nodes: 0, occupied: 0 } };
  const bounds = boundsFromPositions(allPoints);
  const density = Array.from({ length: grid }, () => new Float32Array(grid));
  const pointToCell = (point) => {
    const gx = Math.max(0, Math.min(grid - 1, Math.floor(((point.x - bounds.minX) / ((bounds.sizeX || 1))) * (grid - 1))));
    const gy = Math.max(0, Math.min(grid - 1, Math.floor(((point.y - bounds.minY) / ((bounds.sizeY || 1))) * (grid - 1))));
    return [gx, gy];
  };

  for (const polyline of polylines) {
    const sampled = samplePolyline(polyline, Math.max(8, Math.min(44, polyline.length * 3)));
    for (let i = 1; i < sampled.length; i += 1) {
      const a = sampled[i - 1];
      const b = sampled[i];
      const steps = Math.max(1, Math.ceil(dist3(a, b) / Math.max(bounds.sizeX, bounds.sizeY, 1) * grid * 1.7));
      for (let s = 0; s <= steps; s += 1) {
        const t = s / steps;
        const point = {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + ((b.z || 0) - (a.z || 0)) * t
        };
        const [gx, gy] = pointToCell(point);
        density[gx][gy] += 1;
      }
    }
  }

  const active = new Set();
  for (let x = 0; x < grid; x += 1) {
    for (let y = 0; y < grid; y += 1) {
      if (density[x][y] >= threshold) active.add(`${x}|${y}`);
    }
  }
  if (!active.size) return { polylines: [], stats: { branches: 0, nodes: 0, occupied: 0 } };

  const neighborsOf = (x, y) => {
    const out = [];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
        const key = `${nx}|${ny}`;
        if (active.has(key)) out.push([nx, ny]);
      }
    }
    return out;
  };

  const cellCenter = (x, y) => ({
    x: bounds.minX + (x / Math.max(1, grid - 1)) * (bounds.sizeX || 1),
    y: bounds.minY + (y / Math.max(1, grid - 1)) * (bounds.sizeY || 1),
    z: 0
  });

  const degree = new Map();
  active.forEach((key) => {
    const [x, y] = key.split('|').map(Number);
    degree.set(key, neighborsOf(x, y).length);
  });

  const visitedEdges = new Set();
  const branches = [];
  const isJunction = (key) => (degree.get(key) || 0) !== 2;

  function walk(startKey, nextKey) {
    const points = [];
    let prev = startKey;
    let curr = nextKey;
    points.push(cellCenter(...startKey.split('|').map(Number)));
    while (curr) {
      const edgeKey = [prev, curr].sort().join('>');
      if (visitedEdges.has(edgeKey)) break;
      visitedEdges.add(edgeKey);
      const [cx, cy] = curr.split('|').map(Number);
      points.push(cellCenter(cx, cy));
      if (isJunction(curr)) break;
      const nextNeighbors = neighborsOf(cx, cy)
        .map(([nx, ny]) => `${nx}|${ny}`)
        .filter((key) => key !== prev);
      if (!nextNeighbors.length) break;
      prev = curr;
      curr = nextNeighbors[0];
    }
    return points;
  }

  active.forEach((key) => {
    if (!isJunction(key)) return;
    const [x, y] = key.split('|').map(Number);
    neighborsOf(x, y).forEach(([nx, ny]) => {
      const nextKey = `${nx}|${ny}`;
      const edgeKey = [key, nextKey].sort().join('>');
      if (visitedEdges.has(edgeKey)) return;
      const points = walk(key, nextKey);
      if (points.length >= minBranchLength) branches.push(simplifyPolyline(points, simplify));
    });
  });

  return {
    polylines: branches,
    stats: {
      branches: branches.length,
      nodes: active.size,
      occupied: active.size,
      averageBranchLength: branches.length ? branches.reduce((acc, line) => acc + polylineLength(line), 0) / branches.length : 0
    }
  };
}

export function buildPreviewSvg(polylines = [], options = {}) {
  const { width = 320, height = 180, background = '#07111f', stroke = '#9dd5ff', strokeOpacity = 0.42 } = options;
  const points = polylines.flat();
  if (!points.length) {
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${background}"/><text x="50%" y="50%" fill="#bcd4ff" font-size="12" text-anchor="middle" dominant-baseline="middle">No preview</text></svg>`;
  }
  const bounds = boundsFromPositions(points);
  const scale = Math.min(width / Math.max(bounds.sizeX || 1, 1), height / Math.max(bounds.sizeY || 1, 1)) * 0.84;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const paths = polylines.map((polyline) => {
    const d = polyline.map((p, index) => {
      const x = width / 2 + (p.x - cx) * scale;
      const y = height / 2 - (p.y - cy) * scale;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(' ');
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.2"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${background}"/>${paths}</svg>`;
}

export function serializeStudioState(payload = {}) {
  return JSON.stringify(payload, null, 2);
}
