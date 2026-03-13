import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { boundsFromPositions } from '../utils/math.js';

export class SceneController {
  constructor({ canvas, onRender }) {
    this.canvas = canvas;
    this.onRender = onRender;
    this.needsRender = true;
    this.isDisposed = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0f1320');

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000000);
    this.camera.position.set(0, 0, 120);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearAlpha(1);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
    });

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.45));
    this.scene.add(new THREE.HemisphereLight(0xe6f0ff, 0x1a2335, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.95);
    keyLight.position.set(30, 30, 50);
    this.scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xbfd6ff, 1.18);
    fillLight.position.set(-40, -18, 35);
    this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.7);
    rimLight.position.set(0, 0, -80);
    this.scene.add(rimLight);

    this._resizeHandler = () => this.resize();
    window.addEventListener('resize', this._resizeHandler);
    this.resize();
    this.startLoop();
  }

  startLoop() {
    const tick = () => {
      if (this.isDisposed) return;
      const changed = this.controls.update();
      if (changed || this.needsRender) {
        this.renderer.render(this.scene, this.camera);
        this.onRender?.(this.camera);
        this.needsRender = false;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  getViewportSize() {
    return {
      width: this.canvas.clientWidth || this.canvas.parentElement.clientWidth || window.innerWidth,
      height: this.canvas.clientHeight || this.canvas.parentElement.clientHeight || window.innerHeight
    };
  }

  resize() {
    const { width, height } = this.getViewportSize();
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.render();
  }

  setBackground(hex) {
    this.scene.background = new THREE.Color(hex);
    this.render();
  }

  fitToPositions(positions) {
    if (!positions?.length) return;
    const bounds = boundsFromPositions(positions);
    const center = new THREE.Vector3(
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      (bounds.minZ + bounds.maxZ) / 2
    );
    const radius = Math.max(bounds.sizeX, bounds.sizeY, bounds.sizeZ, 1) * 0.8;
    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y, center.z + radius * 2.4 + 10);
    this.camera.near = Math.max(0.1, radius / 5000);
    this.camera.far = radius * 60 + 10000;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.render();
  }

  reset() {
    this.controls.reset();
    this.render();
  }

  exportPng({ scale = 2, transparent = false } = {}) {
    const { width, height } = this.getViewportSize();
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const oldSize = new THREE.Vector2();
    this.renderer.getSize(oldSize);
    const oldPixelRatio = this.renderer.getPixelRatio();
    const previousBackground = this.scene.background;
    const previousClearAlpha = this.renderer.getClearAlpha();

    if (transparent) {
      this.scene.background = null;
      this.renderer.setClearAlpha(0);
    }

    this.renderer.setPixelRatio(1);
    this.renderer.setSize(targetWidth, targetHeight, false);
    this.camera.aspect = targetWidth / Math.max(1, targetHeight);
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    this.onRender?.(this.camera);
    const dataUrl = this.renderer.domElement.toDataURL('image/png');

    this.renderer.setSize(oldSize.x, oldSize.y, false);
    this.renderer.setPixelRatio(oldPixelRatio);
    this.camera.aspect = oldSize.x / Math.max(1, oldSize.y);
    this.camera.updateProjectionMatrix();
    this.scene.background = previousBackground;
    this.renderer.setClearAlpha(previousClearAlpha);
    this.render();
    return dataUrl;
  }

  render() {
    this.needsRender = true;
  }

  dispose() {
    this.isDisposed = true;
    window.removeEventListener('resize', this._resizeHandler);
    this.controls.dispose();
    this.renderer.dispose();
  }
}
