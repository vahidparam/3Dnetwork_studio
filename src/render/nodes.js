import * as THREE from 'three';

export class NodeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.mesh = null;
    this.detail = 10;
    this.lastState = null;
  }

  dispose() {
    if (!this.mesh) return;
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh = null;
  }

  update({ positions, sizes, colors, detail = 10 }) {
    const count = positions.length;
    const needsRebuild = !this.mesh || this.detail !== detail || this.mesh.count !== count;
    if (needsRebuild) {
      this.dispose();
      this.detail = detail;
      const geometry = new THREE.IcosahedronGeometry(1, Math.max(1, Math.min(3, Math.round(detail / 6))));
      
const material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(0xffffff),
        vertexColors: true,
        toneMapped: false,
        transparent: false,
        opacity: 1
      });
      this.mesh = new THREE.InstancedMesh(geometry, material, count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.setColorAt(0, new THREE.Color('#69a6ff'));
      if (this.mesh.instanceColor) this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.matrixAutoUpdate = false;
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = false;
      this.scene.add(this.mesh);
    }

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i += 1) {
      const p = positions[i];
      const size = sizes[i] ?? 1;
      const color = (colors[i] || new THREE.Color('#69a6ff')).clone();
      if (color.getHSL) {
        const hsl = {};
        color.getHSL(hsl);
        if (hsl.l < 0.40 || hsl.s < 0.18) {
          const nextS = Math.max(hsl.s, 0.58);
          const nextL = Math.max(hsl.l, hsl.s < 0.08 ? 0.62 : 0.54);
          color.setHSL(hsl.h, nextS, nextL);
        }
      }
      dummy.position.set(p.x, p.y, p.z ?? 0);
      dummy.scale.setScalar(Math.max(0.0001, size));
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      this.mesh.setColorAt(i, color);
    }
    this.mesh.material.vertexColors = true;
    this.mesh.material.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere?.();
    this.mesh.computeBoundingBox?.();
    this.mesh.updateMatrixWorld(true);
    this.lastState = { positions, sizes, colors, detail };
  }
}
