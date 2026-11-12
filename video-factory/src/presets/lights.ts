import * as THREE from 'three';
import { PALETTE } from './materials';

export const LIGHT_NAMES = ['rim_soft', 'three_point', 'top_hard', 'studio'] as const;

export interface LightRig {
  group: THREE.Group;
  /** 按主题 bbox 调整主光阴影范围，避免阴影糊/锯齿 */
  fitShadow(center: THREE.Vector3, radius: number): void;
  dispose(): void;
}

function makeKeyLight(color: number, intensity: number, pos: [number, number, number]): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...pos);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.bias = -0.0004;
  light.shadow.normalBias = 0.02;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 60;
  return light;
}

function makeFill(color: number, intensity: number, pos: [number, number, number]): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight(color, intensity);
  light.position.set(...pos);
  return light;
}

/**
 * 光效预设：每个预设 = 一盏环境光 + 1~2 盏方向光。
 * 风格化路线刻意不加体积光 / 环境探针，换取可预测的成本与一致观感。
 * 所有光源统一收集，dispose 时逐个释放（阴影贴图归 light 所有）。
 */
export function createLightRig(name: string): LightRig {
  const group = new THREE.Group();
  group.name = `light:${name}`;
  const lights: THREE.Light[] = [];
  const add = <T extends THREE.Light>(light: T): T => {
    group.add(light);
    lights.push(light);
    return light;
  };
  const ambient = (sky: number, ground: number, intensity: number) =>
    add(new THREE.HemisphereLight(sky, ground, intensity));

  let key: THREE.DirectionalLight;

  switch (name) {
    case 'three_point':
      ambient(PALETTE.bone, PALETTE.ink, 0.75);
      key = add(makeKeyLight(0xffd7a8, 2.1, [5, 9, 7]));
      add(makeFill(0x9ec6ff, 0.7, [-6, 4, -4]));
      break;
    case 'top_hard':
      ambient(PALETTE.bone, PALETTE.ink, 0.45);
      key = add(makeKeyLight(0xffffff, 2.6, [0.4, 12, 0.6]));
      key.shadow.radius = 0;
      break;
    case 'studio':
      ambient(0xffffff, 0x2a3138, 1.0);
      key = add(makeKeyLight(0xffd7a8, 2.1, [5, 9, 7]));
      add(makeFill(0xffffff, 0.55, [-5, 3, 6]));
      break;
    case 'rim_soft':
    default:
      ambient(PALETTE.bone, PALETTE.ink2, 0.6);
      key = add(makeKeyLight(0xffd7a8, 2.1, [5, 9, 7]));
      add(makeFill(0x7fd4ff, 1.1, [-4, 3.5, -6]));
      break;
  }

  return {
    group,
    fitShadow(center, radius) {
      const cam = key.shadow.camera;
      const r = Math.max(1.5, radius * 1.6);
      cam.left = -r;
      cam.right = r;
      cam.top = r;
      cam.bottom = -r;
      // far 必须覆盖光源到中心再穿出主体的距离，否则大体量模型阴影被裁没
      cam.far = radius * 9 + 5;
      cam.updateProjectionMatrix();
      key.target.position.copy(center);
      key.target.updateMatrixWorld();
      key.position.set(center.x + radius * 3.2, center.y + radius * 6, center.z + radius * 4.4);
    },
    dispose() {
      for (const light of lights) light.dispose();
    }
  };
}
