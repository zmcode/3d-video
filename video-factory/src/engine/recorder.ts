import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export interface ExportResult {
  blob: Blob;
  codec: string;
  frames: number;
}

export interface ExportOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps: number;
  duration: number;
  renderAt(t: number): void;
  onProgress?(done: number, total: number): void;
}

interface Candidate {
  codec: string;
  muxer: 'avc' | 'vp9';
}

/** 逐个尝试可用编码器，返回第一个被支持的 */
async function pickCodec(width: number, height: number, fps: number, bitrate: number): Promise<Candidate | null> {
  const candidates: Candidate[] = [
    { codec: 'avc1.4d0034', muxer: 'avc' },
    { codec: 'avc1.4d0028', muxer: 'avc' },
    { codec: 'avc1.42001f', muxer: 'avc' },
    { codec: 'vp09.00.10.08', muxer: 'vp9' }
  ];
  for (const c of candidates) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec: c.codec,
        width,
        height,
        bitrate,
        framerate: fps
      });
      if (support.supported) return c;
    } catch {
      // 继续试下一个
    }
  }
  return null;
}

/**
 * 离线逐帧渲染 + WebCodecs 编码 → MP4。
 * 与屏录的区别：时间戳由我们给定，渲染多慢都不会掉帧、不会拉长时间。
 */
export async function exportMp4(opts: ExportOptions): Promise<ExportResult> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('当前浏览器不支持 WebCodecs。请用 Chrome/Edge 94+ 打开；或用「存当前帧 PNG」走外部合成。');
  }

  const { canvas, width, height, fps, duration, renderAt, onProgress } = opts;
  if (canvas.width !== width || canvas.height !== height) {
    throw new Error(`画布尺寸 ${canvas.width}×${canvas.height} 与导出尺寸 ${width}×${height} 不一致，请先把 stage 尺寸对齐`);
  }
  const frames = Math.max(1, Math.round(duration * fps));
  const bitrate = Math.min(24_000_000, Math.max(2_000_000, Math.round(width * height * fps * 0.12)));

  const picked = await pickCodec(width, height, fps, bitrate);
  if (!picked) throw new Error('找不到可用的视频编码器（已尝试 H.264 三档与 VP9）');

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: picked.muxer, width, height, frameRate: fps },
    fastStart: 'in-memory'
  });

  let encodeError: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => {
      try {
        muxer.addVideoChunk(chunk, meta);
      } catch (err) {
        encodeError = err instanceof Error ? err : new Error(String(err));
      }
    },
    error: (err) => {
      encodeError = err instanceof Error ? err : new Error(String(err));
    }
  });

  const keyEvery = Math.max(1, Math.round(fps * 2));
  const frameDuration = Math.round(1_000_000 / fps);

  try {
    encoder.configure({
      codec: picked.codec,
      width,
      height,
      bitrate,
      framerate: fps,
      latencyMode: 'quality'
    });

    for (let i = 0; i < frames; i++) {
      if (encodeError) throw encodeError;

      renderAt(i / fps);

      const frame = new VideoFrame(canvas, {
        timestamp: Math.round((i * 1_000_000) / fps),
        duration: frameDuration
      });
      encoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      frame.close();

      // 背压：编码在独立线程，轮询到队列降下来再继续，避免长片内存尖峰
      while (encoder.encodeQueueSize > 6) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      onProgress?.(i + 1, frames);
    }

    await encoder.flush();
    if (encodeError) throw encodeError;
  } finally {
    try {
      encoder.close();
    } catch {
      // 已关闭或从未成功配置时忽略
    }
  }

  muxer.finalize();
  return { blob: new Blob([target.buffer], { type: 'video/mp4' }), codec: picked.codec, frames };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
