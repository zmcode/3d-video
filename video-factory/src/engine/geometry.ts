import * as THREE from 'three';
import type { SceneNode, Vec3 } from '../dsl/schema';

/** 程序化齿轮轮廓：齿数、半径可调，带中心孔，挤出成体 */
function gearShape(teeth: number, radius: number): THREE.Shape {
  const toothDepth = radius * 0.16;
  const steps = teeth * 4;
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < steps; i++) {
    const phase = i % 4;
    const r = phase === 1 || phase === 2 ? radius : radius - toothDepth;
    const a = (i / steps) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  const shape = new THREE.Shape(pts);
  const hole = new THREE.Path();
  hole.absarc(0, 0, radius * 0.24, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  return shape;
}

/** 把 DSL 节点翻译成几何体（text / arrow 在 build 层特殊处理） */
export function createGeometry(node: SceneNode): THREE.BufferGeometry {
  const seg = node.segments ?? 24;
  switch (node.type) {
    case 'box': {
      const [w, h, d] = node.size ?? [1, 1, 1];
      return new THREE.BoxGeometry(w, h, d);
    }
    case 'cylinder': {
      const r = node.radius ?? 0.5;
      return new THREE.CylinderGeometry(node.radiusTop ?? r, node.radiusBottom ?? r, node.height ?? 1, seg);
    }
    case 'cone':
      return new THREE.ConeGeometry(node.radius ?? 0.5, node.height ?? 1, seg);
    case 'sphere':
      return new THREE.SphereGeometry(node.radius ?? 0.5, seg, Math.max(8, Math.round(seg / 2)));
    case 'torus':
      return new THREE.TorusGeometry(node.radius ?? 0.5, node.tube ?? Math.max(0.02, (node.radius ?? 0.5) * 0.25), 12, seg);
    case 'gear': {
      const teeth = Math.max(3, Math.round(node.teeth ?? 12));
      const radius = node.radius ?? 0.6;
      const depth = node.thickness ?? 0.3;
      const geo = new THREE.ExtrudeGeometry(gearShape(teeth, radius), {
        depth,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: Math.min(0.012, depth * 0.06),
        bevelThickness: Math.min(0.012, depth * 0.06),
        curveSegments: 4
      });
      geo.translate(0, 0, -depth / 2);
      geo.computeVertexNormals();
      return geo;
    }
    default:
      throw new Error(`createGeometry 不处理 type="${node.type}"`);
  }
}

/** 程序化箭头（杆 + 头），用来做"指给别人看"的标注 */
export function createArrow(from: Vec3, to: Vec3, material: THREE.Material): THREE.Group {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const dir = b.clone().sub(a);
  const len = dir.length();
  const radius = Math.max(0.012, len * 0.018);

  const group = new THREE.Group();
  group.name = 'arrow';

  const shaftLen = len * 0.72;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, shaftLen, 12), material);
  shaft.position.y = shaftLen / 2;
  shaft.castShadow = true;

  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.6, len * 0.28, 14), material);
  head.position.y = shaftLen + (len * 0.28) / 2;
  head.castShadow = true;

  group.add(shaft, head);
  group.position.copy(a);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return group;
}
