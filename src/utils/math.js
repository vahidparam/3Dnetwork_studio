export function boundsFromPositions(positions) {
  const bounds = {
    minX: Infinity, minY: Infinity, minZ: Infinity,
    maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity,
    sizeX: 0, sizeY: 0, sizeZ: 0
  };
  for (const p of positions) {
    bounds.minX = Math.min(bounds.minX, p.x);
    bounds.minY = Math.min(bounds.minY, p.y);
    bounds.minZ = Math.min(bounds.minZ, p.z ?? 0);
    bounds.maxX = Math.max(bounds.maxX, p.x);
    bounds.maxY = Math.max(bounds.maxY, p.y);
    bounds.maxZ = Math.max(bounds.maxZ, p.z ?? 0);
  }
  if (!positions.length) {
    bounds.minX = bounds.minY = bounds.minZ = -1;
    bounds.maxX = bounds.maxY = bounds.maxZ = 1;
  }
  bounds.sizeX = bounds.maxX - bounds.minX;
  bounds.sizeY = bounds.maxY - bounds.minY;
  bounds.sizeZ = bounds.maxZ - bounds.minZ;
  return bounds;
}

export function evenlySampleIndexes(total, keep) {
  if (keep >= total) return Array.from({ length: total }, (_, i) => i);
  if (keep <= 0 || total <= 0) return [];
  const step = total / keep;
  const out = [];
  for (let i = 0; i < keep; i += 1) {
    out.push(Math.min(total - 1, Math.floor(i * step)));
  }
  return out;
}

export function normalize(values, fallback = 0) {
  const finite = values.filter((v) => Number.isFinite(v));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 1;
  return values.map((v) => Number.isFinite(v) ? ((v - min) / ((max - min) || 1)) : fallback);
}
