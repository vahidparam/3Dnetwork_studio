import { parseGexfFile } from './parsers/gexf.js';
import { parseCsvFile } from './parsers/csv.js';

function normalizeFieldName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function findCanonicalValue(raw, aliases) {
  const directMap = new Map(Object.entries(raw || {}).map(([key, value]) => [normalizeFieldName(key), value]));
  for (const alias of aliases) {
    const hit = directMap.get(normalizeFieldName(alias));
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function buildAttrBag(raw, reservedAliases) {
  const reserved = new Set(reservedAliases.map((value) => normalizeFieldName(value)));
  const out = { ...(raw.attrs || {}) };
  Object.entries(raw || {}).forEach(([key, value]) => {
    if (key === 'attrs') return;
    if (reserved.has(normalizeFieldName(key))) return;
    out[key] = value;
  });
  return out;
}

function sanitizeNode(raw, fallbackIndex) {
  const id = findCanonicalValue(raw, ['id', 'nodeid', 'identifier']);
  const label = findCanonicalValue(raw, ['label', 'name', 'title']);
  const x = findCanonicalValue(raw, ['x', 'posx', 'positionx']);
  const y = findCanonicalValue(raw, ['y', 'posy', 'positiony']);
  const z = findCanonicalValue(raw, ['z', 'posz', 'positionz']);
  const size = findCanonicalValue(raw, ['size', 'nodesize', 'value']);
  const color = findCanonicalValue(raw, ['color', 'colour', 'rgb']);
  const attrs = buildAttrBag(raw, ['id', 'nodeid', 'identifier', 'label', 'name', 'title', 'x', 'posx', 'positionx', 'y', 'posy', 'positiony', 'z', 'posz', 'positionz', 'size', 'nodesize', 'value', 'color', 'colour', 'rgb']);
  return {
    id: String(id ?? fallbackIndex),
    label: label != null ? String(label) : String(id ?? `Node ${fallbackIndex + 1}`),
    x: Number.isFinite(Number(x)) ? Number(x) : undefined,
    y: Number.isFinite(Number(y)) ? Number(y) : undefined,
    z: Number.isFinite(Number(z)) ? Number(z) : undefined,
    size: Number.isFinite(Number(size)) ? Number(size) : undefined,
    color: color != null ? String(color) : undefined,
    attrs
  };
}

function sanitizeEdge(raw, fallbackIndex) {
  const id = findCanonicalValue(raw, ['id', 'edgeid', 'identifier']);
  const source = findCanonicalValue(raw, ['source', 'from', 'src']);
  const target = findCanonicalValue(raw, ['target', 'to', 'dst', 'destination']);
  const weight = findCanonicalValue(raw, ['weight', 'value', 'count']);
  const attrs = buildAttrBag(raw, ['id', 'edgeid', 'identifier', 'source', 'from', 'src', 'target', 'to', 'dst', 'destination', 'weight', 'value', 'count']);
  return {
    id: String(id ?? fallbackIndex),
    source: source != null ? String(source) : undefined,
    target: target != null ? String(target) : undefined,
    weight: Number.isFinite(Number(weight)) ? Number(weight) : 1,
    attrs
  };
}

export async function loadGraphFromFiles({ gexfFile, nodesCsvFile, edgesCsvFile, onProgress = null, onPhase = null }) {
  if (nodesCsvFile && edgesCsvFile) {
    onPhase?.('Reading CSV files…');
    onProgress?.(10);
    const [rawNodes, rawEdges] = await Promise.all([parseCsvFile(nodesCsvFile), parseCsvFile(edgesCsvFile)]);
    onProgress?.(100);
    return { nodes: rawNodes, edges: rawEdges };
  }
  if (gexfFile) {
    return parseGexfFile(gexfFile, { onProgress, onPhase });
  }
  if (!nodesCsvFile || !edgesCsvFile) {
    throw new Error('Provide one GEXF file, or both nodes and edges CSV files.');
  }
}

function isNumericLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && /^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(trimmed);
}

export function buildGraph(rawGraph) {
  const nodes = (rawGraph.nodes || []).map((node, index) => sanitizeNode(node, index));
  const edges0 = (rawGraph.edges || []).map((edge, index) => sanitizeEdge(edge, index));

  const nodeIndexById = new Map();
  nodes.forEach((node, index) => nodeIndexById.set(node.id, index));

  const edges = [];
  for (const edge of edges0) {
    if (!nodeIndexById.has(edge.source) || !nodeIndexById.has(edge.target)) continue;
    const sourceIndex = nodeIndexById.get(edge.source);
    const targetIndex = nodeIndexById.get(edge.target);
    edges.push({ ...edge, sourceIndex, targetIndex });
  }

  const degree = new Array(nodes.length).fill(0);
  const weightedDegree = new Array(nodes.length).fill(0);
  const neighbors = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    degree[edge.sourceIndex] += 1;
    degree[edge.targetIndex] += 1;
    weightedDegree[edge.sourceIndex] += edge.weight;
    weightedDegree[edge.targetIndex] += edge.weight;
    neighbors[edge.sourceIndex].push(edge.targetIndex);
    neighbors[edge.targetIndex].push(edge.sourceIndex);
  }

  const nodeAttrSet = new Set();
  const nodeNumericSet = new Set();
  const nodeCategoricalSet = new Set();
  for (const node of nodes) {
    Object.entries(node.attrs).forEach(([key, value]) => {
      nodeAttrSet.add(key);
      if (isNumericLike(value)) nodeNumericSet.add(key);
      else if (value != null && String(value).trim() !== '') nodeCategoricalSet.add(key);
    });
  }
  if (nodes.some((n) => n.color != null)) nodeAttrSet.add('color');
  if (nodes.some((n) => Number.isFinite(n.size))) nodeNumericSet.add('size');

  const flags = {
    has2DPositions: nodes.some((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
    hasZPositions: nodes.some((n) => Number.isFinite(n.z))
  };

  return {
    nodes,
    edges,
    metrics: { degree, weightedDegree, neighbors },
    attributes: {
      nodeAll: Array.from(nodeAttrSet).sort((a, b) => a.localeCompare(b)),
      nodeNumeric: Array.from(nodeNumericSet).sort((a, b) => a.localeCompare(b)),
      nodeCategorical: Array.from(nodeCategoricalSet).sort((a, b) => a.localeCompare(b))
    },
    flags
  };
}
