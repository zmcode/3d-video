import * as THREE from 'three';
import type { SceneNode, Shot } from '../dsl/schema';
import { createArrow, createGeometry } from './geometry';
import { createTextMaterial, textColor } from '../presets/materials';

const DEG = Math.PI / 180;

export interface BaseTransform {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}

export interface BuiltShot {
  root: THREE.Group;
  objects: Map<string, THREE.Object3D>;
  bases: Map<string, BaseTransform>;
  /** subject 的包围盒（未指定 subject 时为整个镜头） */
  subjectBox: THREE.Box3;
  dispose(): void;
}

export interface BuildOptions {
  materials: Map<string, THREE.Material>;
  outlineMaterial: THREE.Material;
}

function applyTransform(obj: THREE.Object3D, node: SceneNode): void {
  if (node.at) obj.position.set(...node.at);
  if (node.rot) obj.rotation.set(node.rot[0] * DEG, node.rot[1] * DEG, node.rot[2] * DEG);
  if (node.scale !== undefined) {
    if (typeof node.scale === 'number') obj.scale.setScalar(node.scale);
    else obj.scale.set(...node.scale);
  }
}

function addOutline(mesh: THREE.Mesh, material: THREE.Material): void {
  const geo = mesh.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const radius = Math.max(0.05, geo.boundingSphere?.radius ?? 1);
  const outline = new THREE.Mesh(geo, material);
  outline.scale.setScalar(1 + 0.016 / radius);
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = -1;
  mesh.add(outline);
}

export function buildShot(shot: Shot, opts: BuildOptions): BuiltShot {
  const root = new THREE.Group();
  root.name = `shot:${shot.id}`;

  const objects = new Map<string, THREE.Object3D>();
  const bases = new Map<string, BaseTransform>();
  const owned: { dispose(): void }[] = [];

  // pass 1：创建对象
  for (const node of shot.nodes) {
    let obj: THREE.Object3D;

    if (node.type === 'text') {
      const made = createTextMaterial(node.text ?? '', textColor(node.material));
      owned.push(made);
      const h = node.height ?? 0.28;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * made.aspect, h), made.material);
      owned.push(mesh.geometry);
      obj = mesh;
      applyTransform(obj, node);
    } else if (node.type === 'arrow') {
      const material = opts.materials.get(node.material);
      if (!material) throw new Error(`材质 "${node.material}" 不存在`);
      const group = createArrow(node.from ?? [0, 0, 0], node.to ?? [0, 1, 0], material);
      for (const child of group.children) {
        const mesh = child as THREE.Mesh;
        owned.push(mesh.geometry);
        if (node.outline !== false) addOutline(mesh, opts.outlineMaterial);
      }
      obj = group;
      applyTransform(obj, node);
    } else {
      const material = opts.materials.get(node.material);
      if (!material) throw new Error(`材质 "${node.material}" 不存在`);
      const geo = createGeometry(node);
      owned.push(geo);
      const mesh = new THREE.Mesh(geo, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (node.outline !== false) addOutline(mesh, opts.outlineMaterial);
      obj = mesh;
      applyTransform(obj, node);
    }

    obj.name = node.id;
    objects.set(node.id, obj);
  }

  // pass 2：挂载父子关系
  for (const node of shot.nodes) {
    const obj = objects.get(node.id)!;
    if (node.parent) {
      const parent = objects.get(node.parent);
      if (!parent) throw new Error(`parent "${node.parent}" 不存在`);
      parent.add(obj);
    } else {
      root.add(obj);
    }
  }

  root.updateMatrixWorld(true);

  // 记录基准变换（供每帧重置，保证任意 t 都是纯函数）
  for (const node of shot.nodes) {
    const obj = objects.get(node.id)!;
    bases.set(node.id, {
      position: obj.position.clone(),
      quaternion: obj.quaternion.clone(),
      scale: obj.scale.clone()
    });
  }

  const subjectBox = new THREE.Box3();
  const subjectIds = shot.subject && shot.subject.length ? shot.subject : [...objects.keys()];
  for (const id of subjectIds) {
    const obj = objects.get(id);
    if (!obj) continue;
    subjectBox.expandByObject(obj);
  }
  if (subjectBox.isEmpty()) subjectBox.setFromObject(root);

  // 运动包络：explode 会把节点推出基准包围盒，取景/阴影要预留空间，否则出画
  const envelope = (shot.motion ?? []).reduce(
    (acc, m) => (m.type === 'explode' ? acc + Math.abs(m.distance ?? 0.6) : acc),
    0
  );
  if (envelope > 0) subjectBox.expandByScalar(envelope);

  return {
    root,
    objects,
    bases,
    subjectBox,
    dispose() {
      root.removeFromParent();
      for (const item of owned) item.dispose();
    }
  };
}
