import * as THREE from 'three';

function boostNodeColor(input) {
  const color = (input instanceof THREE.Color ? input : new THREE.Color(input || '#69a6ff')).clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.s < 0.24) hsl.s = 0.68;
  if (hsl.l < 0.30) hsl.l = 0.60;
  else if (hsl.l < 0.40) hsl.l = 0.66;
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s), Math.min(0.86, hsl.l));
}

function makeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLightDirA: { value: new THREE.Vector3(0.7, 0.8, 1.0).normalize() },
      uLightDirB: { value: new THREE.Vector3(-0.8, -0.35, 0.45).normalize() },
      uAmbient: { value: new THREE.Color(0.72, 0.74, 0.78) }
    },
    vertexShader: /* glsl */`
      precision mediump float;

      attribute vec3 position;
      attribute vec3 normal;
      attribute mat4 instanceMatrix;
      attribute vec3 instanceColorCustom;

      uniform mat4 modelMatrix;
      uniform mat4 viewMatrix;
      uniform mat4 projectionMatrix;

      varying vec3 vColor;
      varying vec3 vNormalW;

      void main() {
        mat4 worldMatrix = modelMatrix * instanceMatrix;
        vec4 worldPosition = worldMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(worldMatrix) * normal);
        vColor = instanceColorCustom;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */`
      precision mediump float;

      uniform vec3 uLightDirA;
      uniform vec3 uLightDirB;
      uniform vec3 uAmbient;

      varying vec3 vColor;
      varying vec3 vNormalW;

      void main() {
        vec3 n = normalize(vNormalW);
        float diffA = max(dot(n, normalize(uLightDirA)), 0.0);
        float diffB = max(dot(n, normalize(uLightDirB)), 0.0);
        float hemi = n.y * 0.5 + 0.5;
        vec3 light = uAmbient + vec3(diffA * 0.78 + diffB * 0.34 + hemi * 0.18);
        vec3 shaded = clamp(vColor * light, 0.0, 1.0);
        gl_FragColor = vec4(shaded, 1.0);
      }
    `,
    toneMapped: false,
    depthTest: true,
    depthWrite: true
  });
}

export class NodeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.detail = 10;
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }

  buildMesh(count, detail) {
    const geometry = new THREE.IcosahedronGeometry(1, Math.max(1, Math.min(3, Math.round(detail / 6))));
    const colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
    colorAttr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('instanceColorCustom', colorAttr);

    const material = makeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  update({ positions, sizes, colors, detail = 10, visibleMask = null, emphasisSet = null, selectedIndex = -1 }) {
    const count = positions.length;
    const needsRebuild = !this.mesh || this.detail !== detail || this.mesh.count !== count;
    if (needsRebuild) {
      this.dispose();
      this.detail = detail;
      this.mesh = this.buildMesh(count, detail);
      this.scene.add(this.mesh);
    }

    const dummy = new THREE.Object3D();
    const colorAttr = this.mesh.geometry.getAttribute('instanceColorCustom');
    for (let i = 0; i < count; i += 1) {
      const p = positions[i] || { x: 0, y: 0, z: 0 };
      const visible = !visibleMask || visibleMask[i];
      const emphasized = emphasisSet ? emphasisSet.has(i) : false;
      let size = sizes[i] ?? 1;
      if (i === selectedIndex) size *= 1.35;
      else if (emphasized) size *= 1.12;
      if (!visible) size = 1e-5;

      const color = boostNodeColor(colors[i] || '#69a6ff');
      dummy.position.set(p.x || 0, p.y || 0, p.z || 0);
      dummy.scale.setScalar(Math.max(0.00001, size));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      colorAttr.setXYZ(i, color.r, color.g, color.b);
    }

    colorAttr.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    if (typeof this.mesh.computeBoundingBox === 'function') this.mesh.computeBoundingBox();
    this.mesh.updateMatrixWorld(true);
  }
}
