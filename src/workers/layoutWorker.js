import Graph from 'https://esm.sh/graphology@0.25.4?bundle';
import forceAtlas2 from 'https://esm.sh/graphology-layout-forceatlas2@0.10.1?bundle';

function postProgress(percent) {
  self.postMessage({ type: 'progress', percent });
}

function initialXY(node, i, count) {
  const spread = Math.max(30, Math.sqrt(count) * 4);
  const x = Number.isFinite(node.x) ? node.x : (Math.random() - 0.5) * spread + (i % 3);
  const y = Number.isFinite(node.y) ? node.y : (Math.random() - 0.5) * spread - (i % 5);
  if (x === 0 && y === 0) return { x: 0.001 + i * 1e-6, y: -0.001 - i * 1e-6 };
  return { x, y };
}

function buildGraphologyGraph({ nodes, edges, adjustSizes }) {
  const graph = new Graph({ multi: false, type: 'undirected', allowSelfLoops: false });
  const count = nodes.length;

  for (let i = 0; i < count; i += 1) {
    const pos = initialXY(nodes[i] || {}, i, count);
    graph.addNode(String(i), {
      x: pos.x,
      y: pos.y,
      size: adjustSizes ? Math.max(0.1, Number(nodes[i]?.size) || 1) : 1
    });
  }

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    if (edge.sourceIndex === edge.targetIndex) continue;
    const key = String(i);
    if (!graph.hasEdge(key)) {
      graph.addEdgeWithKey(key, String(edge.sourceIndex), String(edge.targetIndex), {
        weight: Number.isFinite(Number(edge.weight)) ? Number(edge.weight) : 1
      });
    }
  }

  return graph;
}

function runForceAtlas2(payload) {
  const graph = buildGraphologyGraph(payload);
  const iterations = Math.max(10, Number(payload.iterations) || 250);
  const order = graph.order;
  const inferred = forceAtlas2.inferSettings(graph);
  const settings = {
    ...inferred,
    gravity: Math.max(0.001, Number(payload.gravity) || inferred.gravity || 1),
    scalingRatio: Math.max(0.1, Number(payload.repulsion) || inferred.scalingRatio || 10),
    slowDown: Math.max(1, order > 10000 ? 8 : order > 3000 ? 5 : 2),
    barnesHutOptimize: payload.barnesHutOptimize !== false,
    barnesHutTheta: order > 10000 ? 1.4 : 1.2,
    linLogMode: !!payload.linLogMode,
    adjustSizes: !!payload.adjustSizes,
    outboundAttractionDistribution: !!payload.outboundAttractionDistribution,
    strongGravityMode: Number(payload.gravity) > 4
  };

  const chunk = Math.max(5, Math.min(25, Math.floor(iterations / 8) || 10));
  let done = 0;
  while (done < iterations) {
    const step = Math.min(chunk, iterations - done);
    forceAtlas2.assign(graph, {
      iterations: step,
      weighted: true,
      getEdgeWeight: 'weight',
      settings
    });
    done += step;
    postProgress((done / iterations) * 100);
  }

  const positions = new Array(order);
  for (let i = 0; i < order; i += 1) {
    const attrs = graph.getNodeAttributes(String(i));
    positions[i] = { x: Number(attrs.x) || 0, y: Number(attrs.y) || 0 };
  }
  return positions;
}

self.onmessage = (event) => {
  try {
    const positions = runForceAtlas2(event.data);
    self.postMessage({ type: 'result', positions });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'ForceAtlas2 worker failed.' });
  }
};
