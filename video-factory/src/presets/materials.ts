import * as THREE from 'three';

/** 主题调色板：所有材质只引用这些语义色 */
export const PALETTE: Record<string, number> = {
  ink: 0x11161a,
  ink2: 0x1d2429,
  bone: 0xe8e4da,
  steel: 0x8d9aa3,
  signal: 0xffb347,
  rust: 0xd2622a,
  teal: 0x2f8f96,
  plum: 0x8a5f9e
};

export const MATERIAL_NAMES = [
  'toon_steel',
  'toon_bone',
  'toon_signal',
  'toon_rust',
  'toon_teal',
  'toon_plum',
  'toon_ink',
  'flat_ink',
  'flat_bone',
  'emis_signal'
] as const;

function ramp(steps: number): THREE.DataTexture {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round(((i + 1) / steps) * 255);
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.unpackAlignment = 1;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

let ramps: { s3: THREE.DataTexture; s4: THREE.DataTexture } | null = null;

function getRamps() {
  if (!ramps) ramps = { s3: ramp(3), s4: ramp(4) };
  return ramps;
}

/**
 * 风格化 NPR 材质库。
 * 只保留 toon / flat / emissive 三类，参数少、可组合、单帧成本低。
 */
export function createMaterials(): Map<string, THREE.Material> {
  const { s3, s4 } = getRamps();
  const toon = (color: number, steps: 3 | 4 = 3) =>
    new THREE.MeshToonMaterial({ color, gradientMap: steps === 3 ? s3 : s4 });

  const map = new Map<string, THREE.Material>();
  map.set('toon_steel', toon(PALETTE.steel));
  map.set('toon_bone', toon(PALETTE.bone));
  map.set('toon_signal', toon(PALETTE.signal));
  map.set('toon_rust', toon(PALETTE.rust));
  map.set('toon_teal', toon(PALETTE.teal));
  map.set('toon_plum', toon(PALETTE.plum));
  map.set('toon_ink', toon(PALETTE.ink2, 4));
  map.set('flat_ink', new THREE.MeshBasicMaterial({ color: PALETTE.ink }));
  map.set('flat_bone', new THREE.MeshBasicMaterial({ color: PALETTE.bone }));
  map.set('emis_signal', new THREE.MeshBasicMaterial({ color: PALETTE.signal }));
  return map;
}

/** 反向外壳描边材质（BackSide + 缩放），最便宜的风格化描边 */
export function createOutlineMaterial(): THREE.Material {
  return new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });
}

/** 材质名 → 基础色（文字节点用它决定字形颜色，避免"material 写了但被忽略"） */
const MATERIAL_COLOR_KEY: Record<string, keyof typeof PALETTE> = {
  toon_steel: 'steel',
  toon_bone: 'bone',
  toon_signal: 'signal',
  toon_rust: 'rust',
  toon_teal: 'teal',
  toon_plum: 'plum',
  toon_ink: 'ink2',
  flat_ink: 'ink',
  flat_bone: 'bone',
  emis_signal: 'signal'
};

export function textColor(material: string): string {
  const key = MATERIAL_COLOR_KEY[material] ?? 'bone';
  return `#${PALETTE[key].toString(16).padStart(6, '0')}`;
}

/** 文字贴图：引擎内用 canvas 栅格化，不依赖外部字体文件 */
export function createTextMaterial(
  text: string,
  color = '#e8e4da',
  background = 'transparent'
): { material: THREE.MeshBasicMaterial; aspect: number; dispose(): void } {
  const pad = 32;
  const fontSize = 96;
  const font = `600 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const width = Math.max(8, Math.ceil(measure.measureText(text).width) + pad * 2);
  const height = fontSize + pad * 2;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (background !== 'transparent') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2 + fontSize * 0.04);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const material = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide
  });

  return { material, aspect: width / height, dispose: () => { tex.dispose(); material.dispose(); } };
}
