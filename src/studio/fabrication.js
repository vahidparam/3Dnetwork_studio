import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { dist3, makeCurveFromPolyline } from './geometry.js';

function orientCylinder(mesh, a, b) {
  const midpoint = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const direction = new THREE.Vector3().subVectors(b, a);
  const length = direction.length();
  mesh.position.copy(midpoint);
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

function buildMaterial(mode = 'matte', color = '#a9d5ff', opacity = 0.9) {
  const base = new THREE.Color(color);
  if (mode === 'glass') {
    return new THREE.MeshPhysicalMaterial({ color: base, transparent: true, opacity: 0.82 * opacity, transmission: 0.86, roughness: 0.08, thickness: 0.8, metalness: 0.02 });
  }
  if (mode === 'metal') {
    return new THREE.MeshStandardMaterial({ color: base, metalness: 0.88, roughness: 0.28, transparent: true, opacity: 0.95 * opacity });
  }
  if (mode === 'neon') {
    return new THREE.MeshStandardMaterial({ color: base, emissive: base.clone().multiplyScalar(0.9), emissiveIntensity: 1.1, roughness: 0.25, transparent: true, opacity: 0.82 * opacity });
  }
  if (mode === 'clay') {
    return new THREE.MeshStandardMaterial({ color: base, roughness: 0.94, metalness: 0.02, transparent: true, opacity: 0.95 * opacity });
  }
  if (mode === 'blueprint') {
    return new THREE.MeshStandardMaterial({ color: base, emissive: new THREE.Color('#7fe6ff'), emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.08, transparent: true, opacity: 0.88 * opacity });
  }
  return new THREE.MeshStandardMaterial({ color: base, roughness: 0.58, metalness: 0.05, transparent: true, opacity: 0.96 * opacity });
}

function buildNodeGeometry(shape = 'sphere') {
  switch (shape) {
    case 'cube':
      return new THREE.BoxGeometry(1.7, 1.7, 1.7);
    case 'tri-prism':
      return new THREE.CylinderGeometry(1.0, 1.0, 1.8, 3);
    case 'square-prism':
      return new THREE.CylinderGeometry(1.0, 1.0, 1.8, 4);
    case 'hex-prism':
      return new THREE.CylinderGeometry(1.0, 1.0, 1.8, 6);
    case 'octahedron':
      return new THREE.OctahedronGeometry(1.2);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(1.15);
    default:
      return new THREE.SphereGeometry(1.0, 12, 12);
  }
}

function normalizeNodeDescriptor(point, defaultShape = 'sphere', defaultColor = '#b0d7ff') {
  return {
    x: Number(point?.x) || 0,
    y: Number(point?.y) || 0,
    z: Number(point?.z) || 0,
    shape: point?.shape || defaultShape,
    color: point?.color || defaultColor
  };
}


export function buildPolylineMeshGroup(polylines = [], options = {}) {
  const {
    radius = 0.35,
    taper = 0,
    materialMode = 'matte',
    color = '#a9d5ff',
    opacity = 0.9,
    maxSegments = 2000,
    maxCurves = 300,
    closedEnds = true,
    addJointSpheres = true
  } = options;

  const group = new THREE.Group();
  const material = buildMaterial(materialMode, color, opacity);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, !closedEnds);
  const sphereGeometry = new THREE.SphereGeometry(1, 10, 10);
  let segmentCounter = 0;

  polylines.slice(0, maxCurves).forEach((polyline) => {
    for (let i = 1; i < polyline.length; i += 1) {
      if (segmentCounter >= maxSegments) return;
      const a = new THREE.Vector3(polyline[i - 1].x, polyline[i - 1].y, polyline[i - 1].z || 0);
      const b = new THREE.Vector3(polyline[i].x, polyline[i].y, polyline[i].z || 0);
      const segLength = a.distanceTo(b);
      if (segLength < 1e-5) continue;
      const t = polyline.length <= 2 ? 0 : (i - 1) / Math.max(1, polyline.length - 2);
      const localRadius = radius * (1 - taper * t);
      const mesh = new THREE.Mesh(cylinderGeometry, material);
      mesh.scale.x = localRadius;
      mesh.scale.z = localRadius;
      orientCylinder(mesh, a, b);
      group.add(mesh);
      if (addJointSpheres) {
        const sphereA = new THREE.Mesh(sphereGeometry, material);
        sphereA.position.copy(a);
        sphereA.scale.setScalar(localRadius * 1.02);
        group.add(sphereA);
        if (i === polyline.length - 1) {
          const sphereB = new THREE.Mesh(sphereGeometry, material);
          sphereB.position.copy(b);
          sphereB.scale.setScalar(Math.max(localRadius * 0.96, radius * (1 - taper)));
          group.add(sphereB);
        }
      }
      segmentCounter += 1;
    }
  });

  return group;
}

export function buildFabricationGroup(polylines = [], nodePositions = [], options = {}) {
  const {
    radius = 0.5,
    taper = 0.08,
    addBasePlate = false,
    addPedestal = false,
    nodeConnectorScale = 1.5,
    materialMode = 'matte',
    color = '#b0d7ff',
    opacity = 0.96,
    normalizeWidth = 180,
    wallRelief = false,
    reliefDepth = 18,
    maxSegments = 12000,
    maxCurves = 2000,
    nodeShape = 'sphere'
  } = options;

  const group = new THREE.Group();
  const normalizedNodes = (nodePositions || []).map((point) => normalizeNodeDescriptor(point, nodeShape, color));
  const allPoints = [...polylines.flat(), ...normalizedNodes];
  if (!allPoints.length) return group;
  const bounds = new THREE.Box3();
  allPoints.forEach((point) => bounds.expandByPoint(new THREE.Vector3(point.x, point.y, wallRelief ? Math.min(point.z || 0, reliefDepth) : (point.z || 0))));
  const width = Math.max(1, bounds.max.x - bounds.min.x);
  const scale = normalizeWidth / width;

  const scaledPolylines = polylines.map((polyline) => polyline.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
    z: (wallRelief ? Math.min(point.z || 0, reliefDepth) : (point.z || 0)) * scale
  })));

  const scaledNodes = normalizedNodes.map((point) => ({
    x: point.x * scale,
    y: point.y * scale,
    z: (wallRelief ? Math.min(point.z || 0, reliefDepth) : (point.z || 0)) * scale,
    shape: point.shape || nodeShape,
    color: point.color || color
  }));

  const structure = buildPolylineMeshGroup(scaledPolylines, {
    radius: radius * scale,
    taper,
    materialMode,
    color,
    opacity,
    maxSegments,
    maxCurves,
    closedEnds: true,
    addJointSpheres: true
  });
  group.add(structure);

  const geometryCache = new Map();
  const materialCache = new Map();
  scaledNodes.forEach((point) => {
    const shapeKey = point.shape || nodeShape;
    const colorKey = point.color || color;
    if (!geometryCache.has(shapeKey)) geometryCache.set(shapeKey, buildNodeGeometry(shapeKey));
    const materialKey = `${materialMode}|${colorKey}|${opacity}`;
    if (!materialCache.has(materialKey)) materialCache.set(materialKey, buildMaterial(materialMode, colorKey, opacity));
    const mesh = new THREE.Mesh(geometryCache.get(shapeKey), materialCache.get(materialKey));
    mesh.position.set(point.x, point.y, point.z);
    mesh.scale.setScalar(radius * nodeConnectorScale * scale);
    group.add(mesh);
  });

  const bbox = new THREE.Box3().setFromObject(group);
  if (addBasePlate) {
    const plateThickness = Math.max(1.2, radius * 4 * scale);
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry((bbox.max.x - bbox.min.x) + 20 * scale, (bbox.max.y - bbox.min.y) + 20 * scale, plateThickness),
      buildMaterial('clay', '#999999', 1)
    );
    plate.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, bbox.min.z - plateThickness / 2 - radius * scale);
    group.add(plate);
  }

  if (addPedestal) {
    const pedestalHeight = Math.max(10, radius * 16 * scale);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(radius * 9 * scale, radius * 11 * scale, pedestalHeight, 24),
      buildMaterial('clay', '#707070', 1)
    );
    pedestal.position.set((bbox.min.x + bbox.max.x) / 2, (bbox.min.y + bbox.max.y) / 2, bbox.min.z - pedestalHeight / 2 - radius * scale * 6);
    group.add(pedestal);
  }

  return group;
}

export function evaluatePrintability(polylines = [], options = {}) {
  const { radius = 0.5, minPrintableRadius = 0.4 } = options;
  const warnings = [];
  let longestSegment = 0;
  let totalSegments = 0;
  for (const polyline of polylines) {
    for (let i = 1; i < polyline.length; i += 1) {
      const length = dist3(polyline[i - 1], polyline[i]);
      longestSegment = Math.max(longestSegment, length);
      totalSegments += 1;
    }
  }
  if (radius < minPrintableRadius) warnings.push(`Radius ${radius.toFixed(2)} is below the advisory printable radius ${minPrintableRadius.toFixed(2)}.`);
  if (longestSegment > radius * 60) warnings.push('Some struts are very slender relative to thickness and may require supports or thicker radii.');
  if (polylines.length > 2500) warnings.push('The fabrication source is very dense. Consider exporting the skeleton layer or a filtered subset for more robust prints.');
  if (!warnings.length) warnings.push('No major heuristic issues detected. Still validate manifold behavior and supports in your slicer.');
  return { warnings, longestSegment, totalSegments };
}

export async function exportGroup(group, format = 'glb') {
  if (format === 'obj') {
    const exporter = new OBJExporter();
    const text = exporter.parse(group);
    return new Blob([text], { type: 'text/plain' });
  }
  if (format === 'stl') {
    const exporter = new STLExporter();
    const result = exporter.parse(group, { binary: true });
    return new Blob([result], { type: 'model/stl' });
  }
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      group,
      (result) => {
        if (result instanceof ArrayBuffer) resolve(new Blob([result], { type: 'model/gltf-binary' }));
        else resolve(new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' }));
      },
      (error) => reject(error),
      { binary: format === 'glb' }
    );
  });
}
