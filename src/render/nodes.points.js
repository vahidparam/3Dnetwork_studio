import * as THREE from 'three';

function boostNodeColor(input) {
  const color = (input instanceof THREE.Color ? input : new THREE.Color(input || '#69a6ff')).clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.s < 0.2) hsl.s = 0.72;
  if (hsl.l < 0.3) hsl.l = 0.64;
  else if (hsl.l < 0.42) hsl.l = 0.7;
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s), Math.min(0.9, hsl.l));
}

function makeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uViewportHeight: { value: 800 },
      uPixelRatio: { value: Math.min(2, window.devicePixelRatio || 1) },
      uOpacity: { value: 1.0 }
    },
    vertexShader: /* glsl */`
      precision highp float;
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vSelected;
      uniform float uViewportHeight;
      uniform float uPixelRatio;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float depth = max(1.0, -mvPosition.z);
        float px = max(4.0, aSize * uViewportHeight * projectionMatrix[1][1] * 0.42 / depth);
        gl_PointSize = px * uPixelRatio;
        gl_Position = projectionMatrix * mvPosition;
        vColor = aColor;
        vSelected = step(1.35, aSize);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      varying vec3 vColor;
      varying float vSelected;
      uniform float uOpacity;
      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        float r = length(uv);
        if (r > 1.0) discard;
        float body = smoothstep(1.0, 0.0, r);
        float edge = smoothstep(0.72, 0.98, r);
        float halo = smoothstep(1.0, 0.78, r);
        float spec = smoothstep(0.34, 0.0, distance(uv, vec2(-0.34, 0.36)));
        vec3 base = vColor;
        vec3 lit = mix(base, vec3(1.0), spec * 0.28);
        vec3 ringColor = mix(lit, vec3(0.02, 0.04, 0.08), edge * 0.45);
        vec3 color = mix(ringColor, lit, body);
        if (vSelected > 0.5) {
          color = mix(color, vec3(1.0), halo * 0.18);
        }
        float alpha = body * uOpacity;
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
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, count) * 3), 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, count) * 3), 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(new Float32Array(Math.max(1, count)), 1));
    const material = makeMaterial();
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.matrixAutoUpdate = false;
    points.renderOrder = 20;
    points.updateMatrix();
    return points;
  }

  update({ positions, sizes, colors, visibleMask = null, emphasisSet = null, selectedIndex = -1, viewportHeight = 800 }) {
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
    this.mesh.material.uniforms.uViewportHeight.value = viewportHeight;
    this.mesh.material.uniforms.uPixelRatio.value = Math.min(2, window.devicePixelRatio || 1);

    const minVisibleSize = 0.001;
    for (let i = 0; i < count; i += 1) {
      const p = positions[i] || { x: 0, y: 0, z: 0 };
      const visible = !visibleMask || visibleMask[i];
      const emphasized = emphasisSet ? emphasisSet.has(i) : false;
      let size = sizes[i] ?? 1;
      if (i === selectedIndex) size *= 1.45;
      else if (emphasized) size *= 1.12;
      if (!visible) size = minVisibleSize;

      const color = boostNodeColor(colors[i] || '#69a6ff');
      posAttr.setXYZ(i, p.x || 0, p.y || 0, p.z || 0);
      colorAttr.setXYZ(i, color.r, color.g, color.b);
      sizeAttr.setX(i, Math.max(minVisibleSize, size));
    }

    posAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
    this.mesh.geometry.computeBoundingBox();
    this.mesh.updateMatrixWorld(true);
  }
}
