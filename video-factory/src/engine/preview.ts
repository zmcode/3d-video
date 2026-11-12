import type { SceneDoc, Shot } from '../dsl/schema';
import type { Stage } from './renderer';
import { downloadBlob, exportMp4 } from './recorder';

export interface PreviewOptions {
  doc: SceneDoc;
  stage: Stage;
  shot: Shot;
  /** 默认 true；导出时应传 false，避免导出期间 rAF 抢渲染 */
  autoplay?: boolean;
}

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`缺少 DOM 节点 #${id}`);
  return node as T;
}

export function mountPreview({ doc, stage, shot, autoplay = true }: PreviewOptions): void {
  const statusEl = el('status');
  const msgEl = el('msg');
  const playBtn = el<HTMLButtonElement>('play');
  const scrub = el<HTMLInputElement>('scrub');
  const timeEl = el('time');
  const exportBtn = el<HTMLButtonElement>('export');
  const stillBtn = el<HTMLButtonElement>('still');

  const { width, height, fps } = doc.output;
  let playing = autoplay;
  if (!autoplay) playBtn.textContent = '播放';
  let t = Number(new URLSearchParams(location.search).get('t') ?? 0) || 0;
  let last = performance.now();
  let exporting = false;

  const hint = `场景 <b>${doc.id}</b> · 分镜 <b>${shot.id}</b> · ${width}×${height}@${fps} · ${shot.nodes.length} 节点`;

  const setStatus = (extra = '') => {
    const s = stage.stats();
    statusEl.innerHTML = `${hint} · draw ${s.calls} / tri ${s.triangles}${extra ? ' · ' + extra : ''}`;
  };

  const setTime = (next: number) => {
    t = Math.max(0, Math.min(shot.duration, next));
    stage.renderAt(t);
    timeEl.textContent = `${t.toFixed(3)}s / ${shot.duration.toFixed(1)}s`;
    scrub.value = String(Math.round((t / shot.duration) * 1000));
  };

  function tick(now: number): void {
    if (playing) {
      const dt = Math.min(0.1, (now - last) / 1000);
      let next = t + dt;
      if (next > shot.duration) next = 0;
      setTime(next);
    }
    last = now;
    requestAnimationFrame(tick);
  }

  playBtn.addEventListener('click', () => {
    playing = !playing;
    playBtn.textContent = playing ? '暂停' : '播放';
    last = performance.now();
  });

  scrub.addEventListener('input', () => {
    playing = false;
    playBtn.textContent = '播放';
    setTime((Number(scrub.value) / 1000) * shot.duration);
  });

  stillBtn.addEventListener('click', () => {
    stage.renderAt(t);
    const url = (stage.renderer.domElement as HTMLCanvasElement).toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.id}-${shot.id}-${t.toFixed(2)}s.png`;
    a.click();
  });

  exportBtn.addEventListener('click', async () => {
    if (exporting) return;
    exporting = true;
    playing = false;
    playBtn.textContent = '播放';
    exportBtn.disabled = true;
    const started = performance.now();

    try {
      const result = await exportMp4({
        canvas: stage.renderer.domElement as HTMLCanvasElement,
        width,
        height,
        fps,
        duration: shot.duration,
        renderAt: (time) => stage.renderAt(time),
        onProgress: (done, total) => {
          msgEl.textContent = `导出中 ${Math.round((done / total) * 100)}%（${done}/${total} 帧）`;
        }
      });
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      downloadBlob(result.blob, `${doc.id}-${shot.id}.mp4`);
      msgEl.textContent = `已导出 ${doc.id}-${shot.id}.mp4（${(result.blob.size / 1048576).toFixed(1)} MB · ${result.codec} · 用时 ${seconds}s）`;
      setTime(0);
    } catch (err) {
      msgEl.textContent = `导出失败：${err instanceof Error ? err.message : String(err)}`;
    } finally {
      exporting = false;
      exportBtn.disabled = false;
    }
  });

  setStatus();
  setTime(t);
  requestAnimationFrame(tick);
}
