import * as THREE from 'three';
import type { Output, Shot } from '../dsl/schema';
import { buildShot, type BuiltShot } from './build';
import { solveCamera } from './framing';
import { applyMotion } from './motion';
import { createMaterials, createOutlineMaterial } from '../presets/materials';
import { createLightRig, type LightRig } from '../presets/lights';

export interface StageStats {
  calls: number;
  triangles: number;
  resolution: [number, number];
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  output: Output;
  show(shot: Shot): void;
  renderAt(t: number): void;
  resize(width: number, height: number): void;
  stats(): StageStats;
  dispose(): void;
}

function gradientBackground(top: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.62, bottom);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createStage(canvas: HTMLCanvasElement, output: Output): Stage {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(1);
  renderer.setSize(output.width, output.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const background = gradientBackground('#1b232a', '#0b0e11');
  const flatBackground = new THREE.Color(0x11161a);
  scene.background = background;

  const camera = new THREE.PerspectiveCamera(35, output.width / output.height, 0.05, 400);

  const materials = createMaterials();
  const outlineMaterial = createOutlineMaterial();

  let current: { shot: Shot; built: BuiltShot; rig: LightRig } | null = null;
  let grid: THREE.GridHelper | null = null;

  function clearGrid(): void {
    if (!grid) return;
    scene.remove(grid);
    grid.geometry.dispose();
    (grid.material as THREE.Material).dispose();
    grid = null;
  }

  function renderAt(t: number): void {
    if (!current) return;
    applyMotion(current.shot, current.built.objects, current.built.bases, t, current.shot.duration);
    renderer.render(scene, camera);
  }

  function show(shot: Shot): void {
    if (current) {
      current.built.dispose();
      scene.remove(current.rig.group);
      current.rig.dispose();
      current = null;
    }
    clearGrid();

    const built = buildShot(shot, { materials, outlineMaterial });
    scene.add(built.root);

    scene.background = shot.background === 'flat' ? flatBackground : background;

    if (shot.background === 'grid') {
      grid = new THREE.GridHelper(24, 24, 0x2f3a42, 0x1b2227);
      grid.position.y = -1.5;
      scene.add(grid);
    }

    const rig = createLightRig(shot.light ?? 'rim_soft');
    scene.add(rig.group);

    const center = new THREE.Vector3();
    built.subjectBox.getCenter(center);
    const sphere = built.subjectBox.getBoundingSphere(new THREE.Sphere());
    rig.fitShadow(center, Math.max(1, sphere.radius));

    const solved = solveCamera(shot.camera, built.subjectBox, output.width / output.height);
    camera.fov = solved.fov;
    camera.position.copy(solved.position);
    camera.lookAt(solved.target);
    camera.updateProjectionMatrix();

    current = { shot, built, rig };
    renderAt(0);
  }

  return {
    renderer,
    camera,
    scene,
    output,
    show,
    renderAt,
    resize(width, height) {
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    stats() {
      const info = renderer.info.render;
      return {
        calls: info.calls,
        triangles: info.triangles,
        resolution: [output.width, output.height]
      };
    },
    dispose() {
      if (current) {
        current.built.dispose();
        current.rig.dispose();
        current = null;
      }
      clearGrid();
      background.dispose();
      for (const m of materials.values()) m.dispose();
      outlineMaterial.dispose();
      renderer.dispose();
    }
  };
}
