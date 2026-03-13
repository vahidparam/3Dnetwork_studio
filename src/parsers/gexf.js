function directChildrenByLocalName(parent, localName) {
  return Array.from(parent?.children || []).filter((child) => {
    const name = child.localName || child.nodeName.split(':').pop();
    return name === localName;
  });
}

function firstChildByLocalName(parent, localName) {
  const children = parent?.children || [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const name = child.localName || child.nodeName.split(':').pop();
    if (name === localName) return child;
  }
  return null;
}

function findVizChild(nodeEl, name) {
  const children = nodeEl?.children || [];
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    const local = child.localName || child.nodeName.split(':').pop();
    if (local === name) return child;
  }
  return null;
}

function coerceValueByType(raw, type) {
  if (raw == null) return raw;
  const value = String(raw);
  switch ((type || '').toLowerCase()) {
    case 'integer':
    case 'long':
    case 'float':
    case 'double':
      return Number(value);
    case 'boolean':
      return value === 'true';
    default:
      return value;
  }
}

function parseRgbToHex(colorEl) {
  if (!colorEl) return undefined;
  const r = Number(colorEl.getAttribute('r') || 90);
  const g = Number(colorEl.getAttribute('g') || 160);
  const b = Number(colorEl.getAttribute('b') || 255);
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

async function readFileTextProgressive(file, onProgress) {
  if (!file?.stream) {
    const text = await file.text();
    onProgress?.(95);
    return text;
  }
  const total = file.size || 0;
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  let received = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
    received += value?.length || 0;
    if (total) onProgress?.(Math.min(90, (received / total) * 90));
  }
  chunks.push(decoder.decode());
  onProgress?.(95);
  return chunks.join('');
}

export function parseGexfText(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const parserError = xml.getElementsByTagName('parsererror')[0];
  if (parserError) throw new Error('Invalid GEXF file.');

  const graphEl = xml.getElementsByTagName('graph')[0];
  if (!graphEl) throw new Error('GEXF file does not contain a <graph> element.');

  const nodeAttributeDefs = new Map();
  const edgeAttributeDefs = new Map();

  directChildrenByLocalName(graphEl, 'attributes').forEach((block) => {
    const cls = (block.getAttribute('class') || '').toLowerCase();
    const target = cls === 'edge' ? edgeAttributeDefs : nodeAttributeDefs;
    directChildrenByLocalName(block, 'attribute').forEach((attr) => {
      const id = attr.getAttribute('id');
      if (!id) return;
      target.set(id, { title: attr.getAttribute('title') || id, type: attr.getAttribute('type') || 'string' });
    });
  });

  const nodesBlock = firstChildByLocalName(graphEl, 'nodes');
  const edgesBlock = firstChildByLocalName(graphEl, 'edges');

  const nodes = [];
  const nodeEls = nodesBlock ? directChildrenByLocalName(nodesBlock, 'node') : [];
  for (let index = 0; index < nodeEls.length; index += 1) {
    const nodeEl = nodeEls[index];
    const attrs = {};
    const attvalues = firstChildByLocalName(nodeEl, 'attvalues');
    if (attvalues) {
      directChildrenByLocalName(attvalues, 'attvalue').forEach((attValue) => {
        const key = attValue.getAttribute('for');
        if (!key) return;
        const meta = nodeAttributeDefs.get(key);
        attrs[meta?.title || key] = coerceValueByType(attValue.getAttribute('value'), meta?.type);
      });
    }
    const pos = findVizChild(nodeEl, 'position');
    const size = findVizChild(nodeEl, 'size');
    const color = findVizChild(nodeEl, 'color');
    nodes.push({
      id: nodeEl.getAttribute('id') || String(index),
      label: nodeEl.getAttribute('label') || nodeEl.getAttribute('id') || `Node ${index + 1}`,
      x: pos ? Number(pos.getAttribute('x') || 0) : undefined,
      y: pos ? Number(pos.getAttribute('y') || 0) : undefined,
      z: pos && pos.hasAttribute('z') ? Number(pos.getAttribute('z') || 0) : undefined,
      size: size ? Number(size.getAttribute('value') || 1) : undefined,
      color: parseRgbToHex(color),
      attrs
    });
  }

  const edges = [];
  const edgeEls = edgesBlock ? directChildrenByLocalName(edgesBlock, 'edge') : [];
  for (let index = 0; index < edgeEls.length; index += 1) {
    const edgeEl = edgeEls[index];
    const attrs = {};
    const attvalues = firstChildByLocalName(edgeEl, 'attvalues');
    if (attvalues) {
      directChildrenByLocalName(attvalues, 'attvalue').forEach((attValue) => {
        const key = attValue.getAttribute('for');
        if (!key) return;
        const meta = edgeAttributeDefs.get(key);
        attrs[meta?.title || key] = coerceValueByType(attValue.getAttribute('value'), meta?.type);
      });
    }
    edges.push({
      id: edgeEl.getAttribute('id') || String(index),
      source: edgeEl.getAttribute('source'),
      target: edgeEl.getAttribute('target'),
      weight: Number(edgeEl.getAttribute('weight') || 1),
      attrs
    });
  }

  return { nodes, edges };
}

export async function parseGexfFile(file, { onProgress = null, onPhase = null } = {}) {
  onPhase?.('Reading GEXF…');
  const text = await readFileTextProgressive(file, onProgress);
  onPhase?.('Parsing GEXF…');
  const parsed = parseGexfText(text);
  onProgress?.(100);
  return parsed;
}
