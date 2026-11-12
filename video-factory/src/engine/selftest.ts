export interface FrameHash {
  t: number;
  hash: string;
}

export interface DeterminismReport {
  pass: boolean;
  forward: FrameHash[];
  shuffled: FrameHash[];
}

const W = 320;
const H = 180;

/** 采样画布并用 FNV-1a 求哈希；必须在 render() 之后同一次 JS 任务内调用 */
export function hashFrame(source: HTMLCanvasElement, t: number): FrameHash {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建 2D 上下文用于哈希');
  ctx.drawImage(source, 0, 0, W, H);
  const { data } = ctx.getImageData(0, 0, W, H);

  let hash = 0x811c9dc5;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return { t, hash: hash.toString(16).padStart(8, '0') };
}

/**
 * 确定性自检：按正序与乱序分别渲染同一组时间点，比较每个 t 的像素哈希。
 * 用于验证 renderAt(t) 是纯函数（与渲染顺序、重复次数无关）。
 */
export function runDeterminism(
  renderAt: (t: number) => void,
  canvas: HTMLCanvasElement,
  times: number[]
): DeterminismReport {
  const forward: FrameHash[] = [];
  for (const t of times) {
    renderAt(t);
    forward.push(hashFrame(canvas, t));
  }

  const shuffled: FrameHash[] = [];
  for (const t of [...times].reverse()) {
    renderAt(t);
    shuffled.push(hashFrame(canvas, t));
  }

  const byTime = new Map(shuffled.map((f) => [f.t, f.hash]));
  const pass = forward.every((f) => byTime.get(f.t) === f.hash);
  return { pass, forward, shuffled: [...shuffled].sort((a, b) => a.t - b.t) };
}
