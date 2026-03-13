import * as THREE from "three";

function visibleNodeColor(input) {
  const color = (input instanceof THREE.Color ? input : new THREE.Color(input || '#69a6ff')).clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.s < 0.18) hsl.s = 0.58;
  if (hsl.l < 0.34) hsl.l = 0.56;
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s), Math.min(0.86, hsl.l));
}

function makeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
      uOpacity: { value: 1.0 }
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aState;
      attribute float aOpacity;
      varying vec3 vColor;
      varying float vState;
      varying float vOpacity;
      uniform float uPixelRatio;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float basePx = clamp(aSize * 2.8, 2.0, 24.0);
        gl_PointSize = basePx * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
        vColor = aColor;
        vState = aState;
        vOpacity = aOpacity;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vColor;
      varying float vState;
      varying float vOpacity;
      uniform float uOpacity;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;

        float body = 1.0 - smoothstep(0.86, 1.0, r);
        float edge = smoothstep(0.72, 0.98, r);
        float inner = 1.0 - smoothstep(0.0, 0.58, r);

        vec3 color = vColor;
        color = mix(color, vec3(1.0), inner * 0.08);
        color = mix(color, color * 0.62, edge * 0.32);

        if (vState > 1.5) {
          color = mix(color, vec3(1.0, 0.98, 0.86), edge * 0.42);
        } else if (vState > 0.5) {
          color = mix(color, vec3(1.0), edge * 0.14);
        }

        float alpha = body * vOpacity * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), alpha);
      }
    `
  });
}

export class NodeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.capacity = 0;
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
    this.capacity = 0;
  }

  buildMesh(count) {
    const safeCount = Math.max(1, count);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(safeCount * 3), 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(new Float32Array(safeCount * 3), 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(new Float32Array(safeCount), 1));
    geometry.setAttribute('aState', new THREE.Float32BufferAttribute(new Float32Array(safeCount), 1));
    geometry.setAttribute('aOpacity', new THREE.Float32BufferAttribute(new Float32Array(safeCount), 1));
    const material = makeMaterial();
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.matrixAutoUpdate = false;
    points.renderOrder = 20;
    points.updateMatrix();
    return points;
  }

  update({ positions, sizes, colors, visibleMask = null, emphasisSet = null, selectedIndex = -1 }) {
    const count = positions.length;
    if (!this.mesh || this.capacity !== count) {
      this.dispose();
      this.capacity = count;
      this.mesh = this.buildMesh(count);
      this.scene.add(this.mesh);
    }

    const posAttr = this.mesh.geometry.getAttribute('position');
    const colorAttr = this.mesh.geometry.getAttribute('aColor');
    const sizeAttr = this.mesh.geometry.getAttribute('aSize');
    const stateAttr = this.mesh.geometry.getAttribute('aState');
    const opacityAttr = this.mesh.geometry.getAttribute('aOpacity');
    this.mesh.material.uniforms.uPixelRatio.value = Math.min(2, window.devicePixelRatio || 1);

    for (let i = 0; i < count; i += 1) {
      const p = positions[i] || { x: 0, y: 0, z: 0 };
      const visible = !visibleMask || visibleMask[i];
      const emphasized = emphasisSet ? emphasisSet.has(i) : false;
      let size = Math.max(0.2, Number(sizes[i] ?? 1));
      if (i === selectedIndex) size *= 1.2;
      else if (emphasized) size *= 1.08;

      const color = visibleNodeColor(colors[i] || '#69a6ff');
      posAttr.setXYZ(i, Number(p.x) || 0, Number(p.y) || 0, Number(p.z) || 0);
      colorAttr.setXYZ(i, color.r, color.g, color.b);
      sizeAttr.setX(i, visible ? size : 0.2);
      stateAttr.setX(i, i === selectedIndex ? 2 : emphasized ? 1 : 0);
      opacityAttr.setX(i, visible ? 1 : 0);
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    stateAttr.needsUpdate = true;
    opacityAttr.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();
    this.mesh.updateMatrixWorld(true);
  }
}
