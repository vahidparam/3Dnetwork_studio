class MinPQ {
  constructor() { this.heap = []; }
  push(node) {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (!this.heap.length) return null;
    const top = this.heap[0];
    const end = this.heap.pop();
    if (this.heap.length) {
      this.heap[0] = end;
      this.bubbleDown(0);
    }
    return top;
  }
  bubbleUp(idx) {
    const element = this.heap[idx];
    while (idx > 0) {
      const parentIdx = Math.floor((idx - 1) / 2);
      const parent = this.heap[parentIdx];
      if (element.dist >= parent.dist) break;
      this.heap[parentIdx] = element;
      this.heap[idx] = parent;
      idx = parentIdx;
    }
  }
  bubbleDown(idx) {
    const length = this.heap.length;
    const element = this.heap[idx];
    while (true) {
      let leftIdx = 2 * idx + 1;
      let rightIdx = 2 * idx + 2;
      let swap = null;
      if (leftIdx < length && this.heap[leftIdx].dist < element.dist) swap = leftIdx;
      if (rightIdx < length) {
        const right = this.heap[rightIdx];
        const leftDist = swap == null ? element.dist : this.heap[swap].dist;
        if (right.dist < leftDist) swap = rightIdx;
      }
      if (swap == null) break;
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }
}

function postProgress(percent) {
  self.postMessage({ type: 'progress', percent });
}

function dist3(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function bezierPoint(ctrl, t) {
  let pts = ctrl.slice();
  while (pts.length > 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      next.push({
        x: (1 - t) * pts[i].x + t * pts[i + 1].x,
        y: (1 - t) * pts[i].y + t * pts[i + 1].y,
        z: (1 - t) * (pts[i].z || 0) + t * (pts[i + 1].z || 0)
      });
    }
    pts = next;
  }
  return pts[0];
}

function sampleBezier(ctrl, n) {
  if (ctrl.length <= 2) return ctrl;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push(bezierPoint(ctrl, i / Math.max(1, n - 1)));
  }
  return out;
}

function buildAdjacency(nodes, edges, exponent) {
  const adj = Array.from({ length: nodes.length }, () => []);
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    const a = nodes[e.sourceIndex];
    const b = nodes[e.targetIndex];
    const base = Math.max(1e-6, dist3(a, b));
    const w = Math.pow(base, exponent || 2.6);
    adj[e.sourceIndex].push({ v: e.targetIndex, w, edgeIndex: i });
    adj[e.targetIndex].push({ v: e.sourceIndex, w, edgeIndex: i });
  }
  return adj;
}

function shortestPath(sourceIndex, targetIndex, adj, skipEdgeIndex = -1) {
  const n = adj.length;
  const dist = new Float64Array(n);
  const prev = new Int32Array(n);
  dist.fill(Infinity);
  prev.fill(-1);
  dist[sourceIndex] = 0;
  const pq = new MinPQ();
  pq.push({ id: sourceIndex, dist: 0 });

  while (true) {
    const item = pq.pop();
    if (!item) break;
    const u = item.id;
    if (u === targetIndex) break;
    if (item.dist > dist[u]) continue;
    const neighbors = adj[u];
    for (let i = 0; i < neighbors.length; i += 1) {
      const edge = neighbors[i];
      if (edge.edgeIndex === skipEdgeIndex) continue;
      const alt = dist[u] + edge.w;
      if (alt < dist[edge.v]) {
        dist[edge.v] = alt;
        prev[edge.v] = u;
        pq.push({ id: edge.v, dist: alt });
      }
    }
  }

  if (!Number.isFinite(dist[targetIndex])) return null;
  const path = [targetIndex];
  let cur = targetIndex;
  while (cur !== sourceIndex) {
    cur = prev[cur];
    if (cur < 0) return null;
    path.unshift(cur);
  }
  return path;
}

function routeArc(nodes, edges, samples, lift) {
  return edges.map((edge) => {
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const mz = ((a.z || 0) + (b.z || 0)) / 2;
    const d = dist3(a, b);
    const curveLift = d * 0.08 * lift;
    const ctrl = [a, { x: mx, y: my, z: mz + curveLift }, b];
    return sampleBezier(ctrl, samples);
  });
}

function routeHub(nodes, edges, degree, hubCount, samples, lift) {
  const hubIndexes = nodes.map((_, i) => i)
    .sort((a, b) => (degree[b] || 0) - (degree[a] || 0))
    .slice(0, Math.min(Math.max(2, hubCount || 12), nodes.length));

  return edges.map((edge) => {
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    let bestHub = null;
    let bestScore = Infinity;
    for (let i = 0; i < hubIndexes.length; i += 1) {
      const hub = nodes[hubIndexes[i]];
      const score = dist3(a, hub) + dist3(hub, b);
      if (score < bestScore) {
        bestScore = score;
        bestHub = hub;
      }
    }
    if (!bestHub) return [a, b];
    const direct = dist3(a, b);
    if (bestScore > direct * 1.6) {
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const mz = ((a.z || 0) + (b.z || 0)) / 2 + direct * 0.06 * lift;
      return sampleBezier([a, { x: mx, y: my, z: mz }, b], samples);
    }
    const ctrl = [
      a,
      { x: (a.x + bestHub.x) / 2, y: (a.y + bestHub.y) / 2, z: ((a.z || 0) + (bestHub.z || 0)) / 2 + direct * 0.04 * lift },
      bestHub,
      { x: (bestHub.x + b.x) / 2, y: (bestHub.y + b.y) / 2, z: ((bestHub.z || 0) + (b.z || 0)) / 2 + direct * 0.04 * lift },
      b
    ];
    return sampleBezier(ctrl, samples);
  });
}

function routeLegacy(nodes, edges, params) {
  const { exponent, detourCap, samples, excludeDirect } = params;
  const adj = buildAdjacency(nodes, edges, exponent);
  const results = new Array(edges.length);

  for (let i = 0; i < edges.length; i += 1) {
    const edge = edges[i];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const path = shortestPath(edge.sourceIndex, edge.targetIndex, adj, excludeDirect ? i : -1);
    let polyline = null;

    if (path && path.length > 2) {
      const raw = path.map((idx) => nodes[idx]);
      let routedLength = 0;
      for (let j = 1; j < raw.length; j += 1) {
        routedLength += dist3(raw[j - 1], raw[j]);
      }
      const directLength = Math.max(1e-6, dist3(a, b));
      if (routedLength <= detourCap * directLength) {
        polyline = sampleBezier(raw, samples);
      }
    }

    results[i] = polyline || [a, b];

    if (i === 0 || i === edges.length - 1 || i % Math.max(1, Math.floor(edges.length / 100)) === 0) {
      postProgress((i / Math.max(1, edges.length - 1)) * 100);
    }
  }
  return results;
}

self.onmessage = (event) => {
  const { nodes, edges, algorithm, samples, hubCount, lift, detourCap, exponent, degree, excludeDirect } = event.data;
  let polylines = [];

  if (algorithm === 'arc') {
    polylines = routeArc(nodes, edges, samples, lift);
  } else if (algorithm === 'hub') {
    polylines = routeHub(nodes, edges, degree, hubCount, samples, lift);
  } else if (algorithm === 'legacy') {
    polylines = routeLegacy(nodes, edges, { exponent, detourCap, samples, excludeDirect });
  } else {
    polylines = edges.map((edge) => [nodes[edge.sourceIndex], nodes[edge.targetIndex]]);
  }

  self.postMessage({ type: 'result', polylines });
};
