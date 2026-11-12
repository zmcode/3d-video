import type { Motion, SceneDoc, SceneNode, Shot, Vec3 } from './schema';

export class DslError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DslError';
  }
}

const NODE_TYPES = ['box', 'cylinder', 'cone', 'sphere', 'torus', 'gear', 'text', 'arrow'] as const;
const MOTION_TYPES = ['spin', 'bob', 'explode', 'scaleIn', 'track'] as const;
const BACKGROUNDS = ['gradient', 'flat', 'grid'] as const;

function fail(msg: string): never {
  throw new DslError(msg);
}

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function num(
  node: SceneNode,
  key: 'radius' | 'radiusTop' | 'radiusBottom' | 'height' | 'segments' | 'teeth' | 'thickness' | 'tube',
  min: number,
  max: number
): void {
  const v = node[key];
  if (v === undefined) return;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    fail(`节点 "${node.id}": 字段 ${key} 必须是 ${min}~${max} 的数字，实际为 ${JSON.stringify(v)}`);
  }
}

function validateNode(node: SceneNode, scope: string, materials: string[], ids: Set<string>): void {
  if (!node || typeof node !== 'object') fail(`${scope}: 存在非对象的节点`);
  if (typeof node.id !== 'string' || !/^[a-z0-9_]{1,32}$/i.test(node.id)) {
    fail(`${scope}: 节点 id 必须是 1~32 位字母数字下划线，实际为 ${JSON.stringify(node.id)}`);
  }
  if (ids.has(node.id)) fail(`${scope}: 节点 id "${node.id}" 重复`);
  ids.add(node.id);

  if (!NODE_TYPES.includes(node.type)) {
    fail(`节点 "${node.id}": 不支持的 type "${node.type}"，可用：${NODE_TYPES.join(' / ')}`);
  }
  if (!materials.includes(node.material)) {
    fail(`节点 "${node.id}": 材质 "${node.material}" 不存在，可用：${materials.join(' / ')}`);
  }
  if (node.at && !isVec3(node.at)) fail(`节点 "${node.id}": at 必须是 [x,y,z]`);
  if (node.rot && !isVec3(node.rot)) fail(`节点 "${node.id}": rot 必须是 [x,y,z]（度）`);

  if (node.scale !== undefined) {
    const s = node.scale;
    const positive = (v: number) => Number.isFinite(v) && v > 0;
    const ok = typeof s === 'number' ? positive(s) : isVec3(s) && s.every(positive);
    if (!ok) fail(`节点 "${node.id}": scale 必须是正数或 [x,y,z] 三个正数，实际为 ${JSON.stringify(s)}`);
  }

  switch (node.type) {
    case 'box':
      if (node.size && (!isVec3(node.size) || node.size.some((v) => !(v > 0)))) {
        fail(`节点 "${node.id}": box 的 size 必须是 [x,y,z] 三个正数`);
      }
      break;
    case 'cylinder':
      num(node, 'radius', 0, 1000);
      num(node, 'radiusTop', 0, 1000);
      num(node, 'radiusBottom', 0, 1000);
      num(node, 'height', 0.0001, 1000);
      num(node, 'segments', 3, 256);
      break;
    case 'cone':
      num(node, 'radius', 0, 1000);
      num(node, 'height', 0.0001, 1000);
      num(node, 'segments', 3, 256);
      break;
    case 'sphere':
      num(node, 'radius', 0.0001, 1000);
      num(node, 'segments', 3, 256);
      break;
    case 'torus':
      num(node, 'radius', 0.0001, 1000);
      num(node, 'tube', 0.0001, 1000);
      num(node, 'segments', 3, 256);
      break;
    case 'gear':
      num(node, 'teeth', 3, 256);
      num(node, 'radius', 0.0001, 1000);
      num(node, 'thickness', 0.0001, 1000);
      break;
    case 'text':
      if (typeof node.text !== 'string' || !node.text.length) fail(`节点 "${node.id}": text 类型必须给 text 字符串`);
      if (node.height !== undefined && !(node.height > 0)) fail(`节点 "${node.id}": text 的 height 必须为正数`);
      break;
    case 'arrow':
      if (!isVec3(node.from) || !isVec3(node.to)) fail(`节点 "${node.id}": arrow 必须给 from/to 两个 [x,y,z]`);
      if (node.at || node.rot) {
        fail(`节点 "${node.id}": arrow 用 from/to 定义位置与朝向，不支持 at / rot（如需偏移请改 from/to）`);
      }
      break;
  }
}

function validateMotion(m: Motion, scope: string, ids: Set<string>): void {
  if (!MOTION_TYPES.includes(m.type)) {
    fail(`${scope}: 未知 motion type "${m.type}"，可用：${MOTION_TYPES.join(' / ')}`);
  }
  if (!ids.has(m.node)) {
    fail(`${scope}: motion 引用了不存在的节点 "${m.node}"，可用：${[...ids].join(' / ')}`);
  }
  if (m.type === 'track' && (!Array.isArray(m.keys) || m.keys.length < 2)) {
    fail(`${scope}: 节点 "${m.node}" 的 track 至少需要 2 个 keys`);
  }
}

function assertUnique(nodes: SceneNode[], scope: string): void {
  const seen = new Set<string>();
  for (const n of nodes) {
    if (typeof n?.id !== 'string') fail(`${scope}: 存在缺少 id 的节点`);
    if (seen.has(n.id)) fail(`${scope}: 节点 id "${n.id}" 被重复声明`);
    seen.add(n.id);
  }
}

/** 库节点 + 分镜节点合并：同 id 时按字段合并（分镜覆盖库），保证"只写差异字段"成立 */
export function resolveNodes(doc: SceneDoc, shot: Shot): SceneNode[] {
  const merged = new Map<string, SceneNode>();
  for (const n of doc.nodes ?? []) merged.set(n.id, n);
  for (const n of shot.nodes ?? []) {
    const base = merged.get(n.id);
    merged.set(n.id, base ? { ...base, ...n } : n);
  }
  return [...merged.values()];
}

export function validateScene(doc: unknown, materials: string[], lights: string[]): SceneDoc {
  if (!doc || typeof doc !== 'object') fail('场景文档必须是一个对象');
  const d = doc as SceneDoc;

  if (typeof d.id !== 'string' || !d.id) fail('场景缺少 id');
  if (!d.output || typeof d.output !== 'object') fail('场景缺少 output { width, height, fps }');
  const { width, height, fps } = d.output;
  if (!Number.isInteger(width) || width < 64 || width > 7680) fail(`output.width 必须是 64~7680 的整数，实际 ${width}`);
  if (!Number.isInteger(height) || height < 64 || height > 4320) fail(`output.height 必须是 64~4320 的整数，实际 ${height}`);
  if (width % 2 !== 0 || height % 2 !== 0) fail(`output 宽高必须是偶数（H.264 4:2:0 要求），实际 ${width}×${height}`);
  if (!Number.isFinite(fps) || fps < 1 || fps > 120) fail(`output.fps 必须是 1~120，实际 ${fps}`);

  if (!Array.isArray(d.shots) || !d.shots.length) fail('场景至少需要一个 shot');

  if (d.nodes !== undefined) {
    if (!Array.isArray(d.nodes)) fail('nodes 必须是数组');
    assertUnique(d.nodes, '节点库');
    const libraryIds = new Set<string>();
    for (const node of d.nodes) validateNode(node, '节点库', materials, libraryIds);
  }

  const shotIds = new Set<string>();

  for (const shot of d.shots) {
    if (typeof shot.id !== 'string' || !shot.id) fail('shot 缺少 id');
    if (shotIds.has(shot.id)) fail(`shot id "${shot.id}" 重复`);
    shotIds.add(shot.id);
    if (!Number.isFinite(shot.duration) || shot.duration <= 0) {
      fail(`分镜 "${shot.id}": duration 必须是正数，实际 ${shot.duration}`);
    }
    if (shot.nodes !== undefined && !Array.isArray(shot.nodes)) fail(`分镜 "${shot.id}": nodes 必须是数组`);
    assertUnique(shot.nodes ?? [], `分镜 "${shot.id}"`);

    // 关键：校验的是"合并后的节点"，与运行时 resolveNodes 完全一致
    const nodes = resolveNodes(d, shot);
    if (!nodes.length) fail(`分镜 "${shot.id}": 合并节点库后仍为空，至少需要一个节点`);

    const ids = new Set<string>();
    for (const node of nodes) validateNode(node, shot.id, materials, ids);

    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const node of nodes) {
      if (!node.parent) continue;
      if (!ids.has(node.parent)) {
        fail(`节点 "${node.id}": parent "${node.parent}" 不存在，可用：${[...ids].join(' / ')}`);
      }
      let cursor: SceneNode | undefined = node;
      const seen = new Set<string>();
      while (cursor?.parent) {
        if (seen.has(cursor.id)) fail(`分镜 "${shot.id}": 节点 "${node.id}" 的 parent 链成环`);
        seen.add(cursor.id);
        cursor = byId.get(cursor.parent);
      }
    }

    if (shot.light && !lights.includes(shot.light)) {
      fail(`分镜 "${shot.id}": 光效 "${shot.light}" 不存在，可用：${lights.join(' / ')}`);
    }
    if (shot.background !== undefined && !BACKGROUNDS.includes(shot.background)) {
      fail(`分镜 "${shot.id}": background 必须是 ${BACKGROUNDS.join(' / ')}，实际 "${shot.background}"`);
    }
    if (shot.motion) {
      if (!Array.isArray(shot.motion)) fail(`分镜 "${shot.id}": motion 必须是数组`);
      for (const m of shot.motion) validateMotion(m, `分镜 "${shot.id}"`, ids);
    }
    if (shot.subject !== undefined) {
      if (!Array.isArray(shot.subject)) fail(`分镜 "${shot.id}": subject 必须是节点 id 数组`);
      for (const s of shot.subject) {
        if (!ids.has(s)) fail(`分镜 "${shot.id}": subject 引用了不存在的节点 "${s}"，可用：${[...ids].join(' / ')}`);
      }
    }

    const cam = shot.camera;
    if (cam) {
      if (cam.fov !== undefined && (!Number.isFinite(cam.fov) || cam.fov < 1 || cam.fov > 120)) {
        fail(`分镜 "${shot.id}": camera.fov 必须是 1~120，实际 ${cam.fov}`);
      }
      if (cam.position && !isVec3(cam.position)) fail(`分镜 "${shot.id}": camera.position 必须是 [x,y,z]`);
      if (cam.target && !isVec3(cam.target)) fail(`分镜 "${shot.id}": camera.target 必须是 [x,y,z]`);
      const f = cam.framing;
      if (f) {
        if (f.target && !isVec3(f.target)) fail(`分镜 "${shot.id}": framing.target 必须是 [x,y,z]`);
        if (f.elev !== undefined && (!Number.isFinite(f.elev) || Math.abs(f.elev) > 89)) {
          fail(`分镜 "${shot.id}": framing.elev 必须在 -89~89 度（避免相机与 up 共线），实际 ${f.elev}`);
        }
        if (f.dist !== undefined && !(Number.isFinite(f.dist) && f.dist > 0)) {
          fail(`分镜 "${shot.id}": framing.dist 必须是正数，实际 ${f.dist}`);
        }
        if (f.fit !== undefined && !(Number.isFinite(f.fit) && f.fit > 0)) {
          fail(`分镜 "${shot.id}": framing.fit 必须是正数，实际 ${f.fit}`);
        }
      }
    }
  }

  return d;
}
