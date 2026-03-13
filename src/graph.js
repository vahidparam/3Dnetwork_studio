import { parseGexfFile } from './parsers/gexf.js';
import { parseCsvFile } from './parsers/csv.js';

function sanitizeNode(raw, fallbackIndex) {
  const attrs = { ...(raw.attrs || {}) };
  const reserved = new Set(['id', 'label', 'x', 'y', 'z', 'size', 'color']);
  Object.entries(raw).forEach(([key, value]) => {
    if (!reserved.has(key) && key !== 'attrs') attrs[key] = value;
  });
  return {
    id: String(raw.id ?? fallbackIndex),
    label: raw.label != null ? String(raw.label) : String(raw.id ?? `Node ${fallbackIndex + 1}`),
    x: Number.isFinite(Number(raw.x)) ? Number(raw.x) : undefined,
    y: Number.isFinite(Number(raw.y)) ? Number(raw.y) : undefined,
    z: Number.isFinite(Number(raw.z)) ? Number(raw.z) : undefined,
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : undefined,
    color: raw.color != null ? String(raw.color) : undefined,
    attrs
  };
}

function sanitizeEdge(raw, fallbackIndex) {
  const attrs = { ...(raw.attrs || {}) };
  const reserved = new Set(['id', 'source', 'target', 'weight']);
  Object.entries(raw).forEach(([key, value]) => {
    if (!reserved.has(key) && key !== 'attrs') attrs[key] = value;
  });
  return {
    id: String(raw.id ?? fallbackIndex),
    source: raw.source != null ? String(raw.source) : undefined,
    target: raw.target != null ? String(raw.target) : undefined,
    weight: Number.isFinite(Number(raw.weight)) ? Number(raw.weight) : 1,
    attrs
  };
}

export async function loadGraphFromFiles({ gexfFile, nodesCsvFile, edgesCsvFile }) {
  if (gexfFile) {
    return parseGexfFile(gexfFile);
  }
  if (!nodesCsvFile || !edgesCsvFile) {
    throw new Error('Provide one GEXF file, or both nodes and edges CSV files.');
  }
  const [rawNodes, rawEdges] = await Promise.all([parseCsvFile(nodesCsvFile), parseCsvFile(edgesCsvFile)]);
  return {
    nodes: rawNodes,
    edges: rawEdges
  };
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
    edges.push({
      ...edge,
      sourceIndex,
      targetIndex
    });
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
