export interface PixelStats {
  /** 平均亮度 0~255 */
  mean: number;
  /** 采样到的不同颜色数 */
  unique: number;
  /** 近黑像素占比 0~1 */
  darkRatio: number;
  /** 最大通道值 */
  max: number;
}

/**
 * 画布像素自检：用来在自动化环境里判断"这一帧到底渲没渲出来"。
 * 必须在同一次 JS 任务内、紧接 render() 之后调用（避免 drawing buffer 被清空）。
 */
export function pixelStats(source: HTMLCanvasElement, w = 96, h = 54): PixelStats {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('无法创建 2D 上下文用于自检');
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  let sum = 0;
  let dark = 0;
  let max = 0;
  const seen = new Set<number>();
  const total = w * h;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += luma;
    if (luma < 12) dark++;
    if (r > max) max = r;
    if (g > max) max = g;
    if (b > max) max = b;
    seen.add((r << 16) | (g << 8) | b);
  }

  return {
    mean: sum / total,
    unique: seen.size,
    darkRatio: dark / total,
    max
  };
}
