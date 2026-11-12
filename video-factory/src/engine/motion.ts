import * as THREE from 'three';
import type { Ease, Motion, Shot } from '../dsl/schema';
import type { BaseTransform } from './build';

const TAU = Math.PI * 2;

const AXES: Record<'x' | 'y' | 'z', THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function ease(kind: Ease | undefined, x: number): number {
  const t = clamp01(x);
  switch (kind) {
    case 'outCubic':
      return 1 - Math.pow(1 - t, 3);
    case 'inOutCubic':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'outBack': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    default:
      return t;
  }
}

function window01(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

function trackValue(m: Motion, t: number): number | THREE.Vector3 | null {
  const keys = m.keys;
  if (!keys || keys.length < 2) return null;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t) return toValue(sorted[0].v);
  const last = sorted[sorted.length - 1];
  if (t >= last.t) return toValue(last.v);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.t && t <= b.t) {
      const p = window01(t, a.t, b.t);
      if (typeof a.v === 'number' && typeof b.v === 'number') {
        return a.v + (b.v - a.v) * p;
      }
      if (Array.isArray(a.v) && Array.isArray(b.v)) {
        return new THREE.Vector3(
          a.v[0] + (b.v[0] - a.v[0]) * p,
          a.v[1] + (b.v[1] - a.v[1]) * p,
          a.v[2] + (b.v[2] - a.v[2]) * p
        );
      }
      return toValue(b.v);
    }
  }
  return null;
}

function toValue(v: number | [number, number, number]): number | THREE.Vector3 {
  return Array.isArray(v) ? new THREE.Vector3(v[0], v[1], v[2]) : v;
}

/**
 * 每帧从基准变换重新计算，保证 renderAt(t) 是纯函数：
 * 随便跳时间、反复渲染同一 t，结果一致。
 */
export function applyMotion(
  shot: Shot,
  objects: Map<string, THREE.Object3D>,
  bases: Map<string, BaseTransform>,
  t: number,
  duration: number
): void {
  for (const [id, base] of bases) {
    const obj = objects.get(id);
    if (!obj) continue;
    obj.position.copy(base.position);
    obj.quaternion.copy(base.quaternion);
    obj.scale.copy(base.scale);
  }

  if (!shot.motion) return;

  for (const m of shot.motion) {
    const obj = objects.get(m.node);
    const base = bases.get(m.node);
    if (!obj || !base) continue;

    switch (m.type) {
      case 'spin': {
        const p = clamp01(t / Math.max(0.0001, duration));
        const angle = (m.turns ?? 1) * TAU * ease(m.ease ?? 'linear', p);
        const axis = AXES[m.axis ?? 'z'];
        obj.quaternion.copy(base.quaternion).multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
        break;
      }
      case 'bob': {
        const amp = m.amplitude ?? 0.1;
        const period = Math.max(0.05, m.period ?? 2);
        obj.position.y = base.position.y + amp * Math.sin((TAU * t) / period);
        break;
      }
      case 'explode': {
        const p = window01(t, m.from ?? 0, m.to ?? duration);
        const distance = (m.distance ?? 0.6) * ease(m.ease ?? 'outCubic', p);
        const axis = AXES[m.axis ?? 'y'];
        obj.position.copy(base.position).addScaledVector(axis, distance);
        break;
      }
      case 'scaleIn': {
        const p = window01(t, m.from ?? 0, m.to ?? Math.min(1, duration));
        const s = Math.max(0.0001, ease(m.ease ?? 'outBack', p));
        obj.scale.copy(base.scale).multiplyScalar(s);
        break;
      }
      case 'track': {
        const v = trackValue(m, t);
        if (v === null) break;
        if (typeof v === 'number') {
          obj.scale.copy(base.scale).multiplyScalar(Math.max(0.0001, v));
        } else {
          obj.position.copy(v);
        }
        break;
      }
    }
  }
}
