import * as THREE from 'three';

function boostNodeColor(input) {
  const color = (input instanceof THREE.Color ? input : new THREE.Color(input || '#69a6ff')).clone();
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (hsl.s < 0.22) hsl.s = 0.62;
  if (hsl.l < 0.34) hsl.l = 0.56;
  else if (hsl.l < 0.46) hsl.l = 0.62;
  return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s), Math.min(0.82, hsl.l));
}

function makeMaterial() {
  const material = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    shininess: 18,
    specular: 0x1f1f1f,
    flatShading: false,
    toneMapped: false,
  });

  material.customProgramCacheKey = () => 'network3d-node-instance-color-v2';
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 instanceColorCustom;
varying vec3 vInstanceColorCustom;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vInstanceColorCustom = instanceColorCustom;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vInstanceColorCustom;`
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( diffuse * vInstanceColorCustom, opacity );'
      );
  };

  return material;
}

export class NodeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.detail = 10;
    this.colorAttr = null;
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
    this.colorAttr = null;
  }

  buildMesh(count, detail) {
    const geometry = new THREE.IcosahedronGeometry(1, Math.max(1, Math.min(3, Math.round(detail / 6))));
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
    geometry.setAttribute('instanceColorCustom', this.colorAttr);

    const material = makeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  update({ positions, sizes, colors, detail = 10 }) {
    const count = positions.length;
    const needsRebuild = !this.mesh || this.detail !== detail || this.mesh.count !== count;
    if (needsRebuild) {
      this.dispose();
      this.detail = detail;
      this.mesh = this.buildMesh(count, detail);
      this.scene.add(this.mesh);
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const p = positions[i] || { x: 0, y: 0, z: 0 };
      const size = sizes[i] ?? 1;
      const color = boostNodeColor(colors[i] || '#69a6ff');

      dummy.position.set(p.x || 0, p.y || 0, p.z || 0);
      dummy.scale.setScalar(Math.max(0.0001, size));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);

      this.colorAttr.setXYZ(i, color.r, color.g, color.b);
    }

    this.colorAttr.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    if (typeof this.mesh.computeBoundingBox === 'function') this.mesh.computeBoundingBox();
    this.mesh.updateMatrixWorld(true);
  }
}
