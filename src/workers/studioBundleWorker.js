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
    const element = this.heap[idx];
    const length = this.heap.length;
    while (true) {
      let swap = null;
      const left = idx * 2 + 1;
      const right = idx * 2 + 2;
      if (left < length && this.heap[left].dist < element.dist) swap = left;
      if (right < length) {
        const ref = swap == null ? element.dist : this.heap[swap].dist;
        if (this.heap[right].dist < ref) swap = right;
      }
      if (swap == null) break;
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }
}

function postProgress(percent, phase = '') {
  self.postMessage({ type: 'progress', percent, phase });
}

function dist3(a, b) {
  const dx = (a.x || 0) - (b.x || 0);
  const dy = (a.y || 0) - (b.y || 0);
  const dz = (a.z || 0) - (b.z || 0);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function mix(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t
  };
}

function bezierPoint(ctrl, t) {
  let pts = ctrl.slice();
  while (pts.length > 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i += 1) next.push(mix(pts[i], pts[i + 1], t));
    pts = next;
  }
  return pts[0];
}

function sampleBezier(ctrl, n) {
  const out = [];
  const count = Math.max(2, n || 12);
  for (let i = 0; i < count; i += 1) out.push(bezierPoint(ctrl, i / (count - 1)));
  return out;
}

function chaikin(polyline, iterations = 1) {
  let current = polyline.map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  if (current.length < 3) return current;
  for (let iter = 0; iter < iterations; iter += 1) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      next.push(mix(current[i], current[i + 1], 0.25));
      next.push(mix(current[i], current[i + 1], 0.75));
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function sampleStraight(a, b, n) {
  const out = [];
  const count = Math.max(2, n || 12);
  for (let i = 0; i < count; i += 1) out.push(mix(a, b, i / (count - 1)));
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
    for (const edge of adj[u]) {
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

function featureForEdge(nodes, edge, withZ = false) {
  const a = nodes[edge.sourceIndex];
  const b = nodes[edge.targetIndex];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const mz = ((a.z || 0) + (b.z || 0)) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = (b.z || 0) - (a.z || 0);
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  return withZ
    ? [mx, my, mz, dx / len, dy / len, dz / len, len]
    : [mx, my, dx / len, dy / len, len];
}

function kMeans(features, k = 12, iterations = 6) {
  const safeK = Math.max(1, Math.min(k, features.length || 1));
  const centers = [];
  for (let i = 0; i < safeK; i += 1) centers.push(features[Math.floor((i / safeK) * features.length)].slice());
  const labels = new Int32Array(features.length);

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < features.length; i += 1) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centers.length; c += 1) {
        let d = 0;
        for (let j = 0; j < features[i].length; j += 1) {
          const diff = features[i][j] - centers[c][j];
          d += diff * diff;
        }
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      labels[i] = best;
    }

    const sums = centers.map((center) => ({ sum: new Float64Array(center.length), count: 0 }));
    for (let i = 0; i < features.length; i += 1) {
      const slot = sums[labels[i]];
      slot.count += 1;
      for (let j = 0; j < features[i].length; j += 1) slot.sum[j] += features[i][j];
    }
    for (let c = 0; c < centers.length; c += 1) {
      if (!sums[c].count) continue;
      for (let j = 0; j < centers[c].length; j += 1) centers[c][j] = sums[c].sum[j] / sums[c].count;
    }
  }
  return { labels, centers };
}

function clusterProfiles(nodes, edges, edgeIndexes, clusterCount, withZ = false) {
  const features = edgeIndexes.map((edgeIndex) => featureForEdge(nodes, edges[edgeIndex], withZ));
  const { labels } = kMeans(features, clusterCount, 7);
  const profiles = new Map();

  edgeIndexes.forEach((edgeIndex, localIndex) => {
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const label = labels[localIndex];
    if (!profiles.has(label)) profiles.set(label, { center: { x: 0, y: 0, z: 0 }, axis: { x: 0, y: 0, z: 0 }, edges: [], length: 0 });
    const profile = profiles.get(label);
    profile.center.x += (a.x + b.x) / 2;
    profile.center.y += (a.y + b.y) / 2;
    profile.center.z += ((a.z || 0) + (b.z || 0)) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = (b.z || 0) - (a.z || 0);
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    profile.axis.x += dx / len;
    profile.axis.y += dy / len;
    profile.axis.z += dz / len;
    profile.length += len;
    profile.edges.push(edgeIndex);
  });

  profiles.forEach((profile) => {
    const count = profile.edges.length || 1;
    profile.center.x /= count;
    profile.center.y /= count;
    profile.center.z /= count;
    profile.axis.x /= count;
    profile.axis.y /= count;
    profile.axis.z /= count;
    const norm = Math.sqrt(profile.axis.x ** 2 + profile.axis.y ** 2 + profile.axis.z ** 2) || 1;
    profile.axis.x /= norm;
    profile.axis.y /= norm;
    profile.axis.z /= norm;
    profile.length /= count;
    profile.normal = { x: -profile.axis.y, y: profile.axis.x, z: 0 };
    const nNorm = Math.sqrt(profile.normal.x ** 2 + profile.normal.y ** 2 + profile.normal.z ** 2) || 1;
    profile.normal.x /= nNorm;
    profile.normal.y /= nNorm;
    profile.normal.z /= nNorm;
  });

  return { labels, profiles };
}

function routeStraight(nodes, edges, edgeIndexes, samples) {
  return edgeIndexes.map((edgeIndex) => {
    const edge = edges[edgeIndex];
    return sampleStraight(nodes[edge.sourceIndex], nodes[edge.targetIndex], samples);
  });
}

function routeArc(nodes, edges, edgeIndexes, samples, lift = 1) {
  return edgeIndexes.map((edgeIndex) => {
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const mz = ((a.z || 0) + (b.z || 0)) / 2;
    const d = dist3(a, b);
    const ctrl = [a, { x: mx, y: my, z: mz + d * 0.08 * lift }, b];
    return sampleBezier(ctrl, samples);
  });
}

function routeHub(nodes, edges, edgeIndexes, degree, hubCount, samples, lift) {
  const hubIndexes = nodes.map((_, i) => i).sort((a, b) => (degree[b] || 0) - (degree[a] || 0)).slice(0, Math.max(2, Math.min(hubCount || 10, nodes.length)));
  return edgeIndexes.map((edgeIndex) => {
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    let bestHub = null;
    let bestScore = Infinity;
    hubIndexes.forEach((hubIndex) => {
      const hub = nodes[hubIndex];
      const score = dist3(a, hub) + dist3(hub, b);
      if (score < bestScore) {
        bestScore = score;
        bestHub = hub;
      }
    });
    if (!bestHub) return sampleStraight(a, b, samples);
    const direct = dist3(a, b);
    if (bestScore > direct * 1.6) return routeArc(nodes, edges, [edgeIndex], samples, lift)[0];
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

function routeLegacy(nodes, edges, edgeIndexes, params) {
  const { exponent, detourCap, samples, excludeDirect } = params;
  const adj = buildAdjacency(nodes, edges, exponent);
  return edgeIndexes.map((edgeIndex, localIndex) => {
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const path = shortestPath(edge.sourceIndex, edge.targetIndex, adj, excludeDirect ? edgeIndex : -1);
    if (path && path.length > 2) {
      const raw = path.map((idx) => nodes[idx]);
      let routedLength = 0;
      for (let j = 1; j < raw.length; j += 1) routedLength += dist3(raw[j - 1], raw[j]);
      const direct = Math.max(1e-6, dist3(a, b));
      if (routedLength <= (detourCap || 2.4) * direct) return chaikin(sampleBezier(raw, samples), 1);
    }
    if (localIndex % Math.max(1, Math.floor(edgeIndexes.length / 20)) === 0) postProgress((localIndex / Math.max(1, edgeIndexes.length - 1)) * 100, 'Routing through graph');
    return sampleStraight(a, b, samples);
  });
}

function routeMingle(nodes, edges, edgeIndexes, params) {
  const { labels, profiles } = clusterProfiles(nodes, edges, edgeIndexes, params.clusterCount || 12, false);
  return edgeIndexes.map((edgeIndex, localIndex) => {
    const profile = profiles.get(labels[localIndex]);
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const span = profile.length * (0.18 + (params.strength || 0.6) * 0.3);
    const anchorA = { x: profile.center.x - profile.axis.x * span, y: profile.center.y - profile.axis.y * span, z: profile.center.z - profile.axis.z * span };
    const anchorB = { x: profile.center.x + profile.axis.x * span, y: profile.center.y + profile.axis.y * span, z: profile.center.z + profile.axis.z * span };
    const sourceNearA = dist3(a, anchorA) <= dist3(a, anchorB);
    const ctrl = sourceNearA ? [a, mix(a, anchorA, 0.55), profile.center, mix(b, anchorB, 0.55), b] : [a, mix(a, anchorB, 0.55), profile.center, mix(b, anchorA, 0.55), b];
    return chaikin(sampleBezier(ctrl, params.samples), 1);
  });
}

function routeDivided(nodes, edges, edgeIndexes, params) {
  const { labels, profiles } = clusterProfiles(nodes, edges, edgeIndexes, params.clusterCount || 12, false);
  const split = params.directionSplit || 3.5;
  return edgeIndexes.map((edgeIndex, localIndex) => {
    const profile = profiles.get(labels[localIndex]);
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const dirSign = ((b.x - a.x) * profile.axis.x + (b.y - a.y) * profile.axis.y) >= 0 ? 1 : -1;
    const offset = { x: profile.normal.x * split * dirSign, y: profile.normal.y * split * dirSign, z: 0 };
    const span = profile.length * (0.18 + (params.strength || 0.6) * 0.25);
    const center = { x: profile.center.x + offset.x, y: profile.center.y + offset.y, z: profile.center.z };
    const anchorA = { x: center.x - profile.axis.x * span, y: center.y - profile.axis.y * span, z: center.z - profile.axis.z * span };
    const anchorB = { x: center.x + profile.axis.x * span, y: center.y + profile.axis.y * span, z: center.z + profile.axis.z * span };
    const sourceNearA = dist3(a, anchorA) <= dist3(a, anchorB);
    const ctrl = sourceNearA ? [a, mix(a, anchorA, 0.6), center, mix(b, anchorB, 0.6), b] : [a, mix(a, anchorB, 0.6), center, mix(b, anchorA, 0.6), b];
    return chaikin(sampleBezier(ctrl, params.samples), 1);
  });
}

function centroidsByLayer(nodes, layerValues, layerGap = 12) {
  const map = new Map();
  nodes.forEach((node, index) => {
    const key = String(layerValues[index] ?? 'missing');
    if (!map.has(key)) map.set(key, { x: 0, y: 0, z: 0, count: 0 });
    const item = map.get(key);
    item.x += node.x;
    item.y += node.y;
    item.z += node.z || 0;
    item.count += 1;
  });
  const keys = [...map.keys()];
  keys.forEach((key, idx) => {
    const item = map.get(key);
    item.x /= item.count || 1;
    item.y /= item.count || 1;
    item.z = (idx - (keys.length - 1) / 2) * layerGap;
  });
  return map;
}

function routeLayered(nodes, edges, edgeIndexes, params) {
  const layerValues = params.layerValues || nodes.map(() => 'layer');
  const centroids = centroidsByLayer(nodes, layerValues, params.layerGap || 14);
  return edgeIndexes.map((edgeIndex) => {
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const la = String(layerValues[edge.sourceIndex] ?? 'missing');
    const lb = String(layerValues[edge.targetIndex] ?? 'missing');
    const ca = centroids.get(la) || { x: a.x, y: a.y, z: a.z || 0 };
    const cb = centroids.get(lb) || { x: b.x, y: b.y, z: b.z || 0 };
    if (la === lb) {
      const center = { x: ca.x, y: ca.y, z: ca.z };
      return chaikin(sampleBezier([a, mix(a, center, 0.5), center, mix(b, center, 0.5), b], params.samples), 1);
    }
    const bridge = { x: (ca.x + cb.x) / 2, y: (ca.y + cb.y) / 2, z: (ca.z + cb.z) / 2 + (params.strength || 0.6) * 4 };
    return chaikin(sampleBezier([a, mix(a, ca, 0.65), ca, bridge, cb, mix(b, cb, 0.65), b], params.samples + 4), 1);
  });
}

function routeSpace3D(nodes, edges, edgeIndexes, params) {
  const { labels, profiles } = clusterProfiles(nodes, edges, edgeIndexes, params.clusterCount || 10, true);
  return edgeIndexes.map((edgeIndex, localIndex) => {
    const profile = profiles.get(labels[localIndex]);
    const edge = edges[edgeIndex];
    const a = nodes[edge.sourceIndex];
    const b = nodes[edge.targetIndex];
    const up = { x: 0, y: 0, z: 1 };
    const side = {
      x: profile.axis.y * up.z - profile.axis.z * up.y,
      y: profile.axis.z * up.x - profile.axis.x * up.z,
      z: profile.axis.x * up.y - profile.axis.y * up.x
    };
    const sideNorm = Math.sqrt(side.x ** 2 + side.y ** 2 + side.z ** 2) || 1;
    side.x /= sideNorm; side.y /= sideNorm; side.z /= sideNorm;
    const lift = (params.lift || 1) * Math.max(4, profile.length * 0.12);
    const span = profile.length * 0.18;
    const center = { x: profile.center.x + side.x * lift * 0.18, y: profile.center.y + side.y * lift * 0.18, z: profile.center.z + lift };
    const anchorA = { x: center.x - profile.axis.x * span, y: center.y - profile.axis.y * span, z: center.z - profile.axis.z * span };
    const anchorB = { x: center.x + profile.axis.x * span, y: center.y + profile.axis.y * span, z: center.z + profile.axis.z * span };
    const sourceNearA = dist3(a, anchorA) <= dist3(a, anchorB);
    const ctrl = sourceNearA ? [a, mix(a, anchorA, 0.5), center, mix(b, anchorB, 0.5), b] : [a, mix(a, anchorB, 0.5), center, mix(b, anchorA, 0.5), b];
    return chaikin(sampleBezier(ctrl, params.samples + 4), 1);
  });
}

function routeKDE(nodes, edges, edgeIndexes, params) {
  const samples = Math.max(8, params.samples || 14);
  const grid = Math.max(24, params.grid || 72);
  const iterations = Math.max(2, params.iterations || 8);
  const strength = Math.max(0.05, Math.min(1.2, params.strength || 0.55));
  const polylines = edgeIndexes.map((edgeIndex) => {
    const edge = edges[edgeIndex];
    return sampleStraight(nodes[edge.sourceIndex], nodes[edge.targetIndex], samples).map((p) => ({ x: p.x, y: p.y, z: p.z || 0 }));
  });

  const points = polylines.flat();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach((p) => {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  });
  const sizeX = Math.max(1e-6, maxX - minX);
  const sizeY = Math.max(1e-6, maxY - minY);

  const toCell = (point) => {
    const gx = Math.max(0, Math.min(grid - 1, Math.floor(((point.x - minX) / sizeX) * (grid - 1))));
    const gy = Math.max(0, Math.min(grid - 1, Math.floor(((point.y - minY) / sizeY) * (grid - 1))));
    return [gx, gy];
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    const counts = Array.from({ length: grid }, () => Array.from({ length: grid }, () => ({ count: 0, x: 0, y: 0, z: 0 })));
    polylines.forEach((line) => {
      for (let i = 1; i < line.length - 1; i += 1) {
        const p = line[i];
        const [gx, gy] = toCell(p);
        const cell = counts[gx][gy];
        cell.count += 1;
        cell.x += p.x;
        cell.y += p.y;
        cell.z += p.z || 0;
      }
    });

    polylines.forEach((line) => {
      for (let i = 1; i < line.length - 1; i += 1) {
        const p = line[i];
        const [gx, gy] = toCell(p);
        let totalWeight = 0;
        let targetX = 0;
        let targetY = 0;
        let targetZ = 0;
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            const nx = gx + dx;
            const ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= grid || ny >= grid) continue;
            const cell = counts[nx][ny];
            if (!cell.count) continue;
            const weight = cell.count / (1 + Math.abs(dx) + Math.abs(dy));
            totalWeight += weight;
            targetX += (cell.x / cell.count) * weight;
            targetY += (cell.y / cell.count) * weight;
            targetZ += (cell.z / cell.count) * weight;
          }
        }
        if (totalWeight > 0) {
          const nx = targetX / totalWeight;
          const ny = targetY / totalWeight;
          const nz = targetZ / totalWeight;
          p.x += (nx - p.x) * strength * 0.35;
          p.y += (ny - p.y) * strength * 0.35;
          p.z += (nz - p.z) * strength * 0.16;
        }
      }
    });

    for (let i = 0; i < polylines.length; i += 1) polylines[i] = chaikin(polylines[i], 1).slice(0, samples + 4);
    postProgress(((iter + 1) / iterations) * 100, 'Advecting density field');
  }

  return polylines;
}

self.onmessage = (event) => {
  try {
    const t0 = performance.now();
    const {
      nodes,
      edges,
      edgeIndexes,
      algorithm,
      samples,
      hubCount,
      lift,
      detourCap,
      exponent,
      degree,
      strength,
      iterations,
      clusterCount,
      directionSplit,
      layerValues,
      layerGap,
      grid,
      excludeDirect
    } = event.data;

    const params = { samples, hubCount, lift, detourCap, exponent, degree, strength, iterations, clusterCount, directionSplit, layerValues, layerGap, grid, excludeDirect };
    let polylines = [];

    if (algorithm === 'arc') polylines = routeArc(nodes, edges, edgeIndexes, samples, lift);
    else if (algorithm === 'hub') polylines = routeHub(nodes, edges, edgeIndexes, degree, hubCount, samples, lift);
    else if (algorithm === 'legacy') polylines = routeLegacy(nodes, edges, edgeIndexes, params);
    else if (algorithm === 'kde') polylines = routeKDE(nodes, edges, edgeIndexes, params);
    else if (algorithm === 'mingle') polylines = routeMingle(nodes, edges, edgeIndexes, params);
    else if (algorithm === 'divided') polylines = routeDivided(nodes, edges, edgeIndexes, params);
    else if (algorithm === 'layered') polylines = routeLayered(nodes, edges, edgeIndexes, params);
    else if (algorithm === 'space3d') polylines = routeSpace3D(nodes, edges, edgeIndexes, params);
    else polylines = routeStraight(nodes, edges, edgeIndexes, samples);

    self.postMessage({ type: 'result', polylines, edgeIndexes, runtimeMs: performance.now() - t0 });
  } catch (error) {
    self.postMessage({ type: 'error', message: error?.message || 'Bundling worker failed.' });
  }
};
