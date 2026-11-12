import demoScene from '../scenes/demo.json';
import type { SceneDoc } from './dsl/schema';
import { resolveNodes, validateScene } from './dsl/validate';
import { MATERIAL_NAMES } from './presets/materials';
import { LIGHT_NAMES } from './presets/lights';
import { createStage } from './engine/renderer';
import { mountPreview } from './engine/preview';
import { exportMp4 } from './engine/recorder';
import { pixelStats } from './engine/selfcheck';
import { runDeterminism } from './engine/selftest';

declare global {
  interface Window {
    __ready?: boolean;
    __stats?: () => unknown;
    __pixelStats?: unknown;
    __doc?: SceneDoc;
  }
}

function msg(text: string): void {
  const el = document.getElementById('msg');
  if (el) el.textContent = text;
  console.log(`[factory] ${text}`);
}

function boot(): void {
  const doc = validateScene(demoScene, [...MATERIAL_NAMES], [...LIGHT_NAMES]);
  window.__doc = doc;

  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const stage = createStage(canvas, doc.output);
  window.__stats = () => stage.stats();

  const params = new URLSearchParams(location.search);
  const wantShot = params.get('shot');
  const index = wantShot ? doc.shots.findIndex((s) => s.id === wantShot) : 0;
  if (index < 0) {
    throw new Error(`分镜 "${wantShot}" 不存在，可用：${doc.shots.map((s) => s.id).join(' / ')}`);
  }
  const shot = doc.shots[index];
  const resolved = { ...shot, nodes: resolveNodes(doc, shot) };
  stage.show(resolved);

  // 确定性自检：?selftest=1
  if (params.has('selftest')) {
    const report = runDeterminism((t) => stage.renderAt(t), canvas, [0, 0.5, 1.2, 3, 5.5]);
    msg(
      `SELFTEST ${report.pass ? 'PASS' : 'FAIL'} · forward=${report.forward.map((f) => `${f.t}:${f.hash}`).join(',')}` +
        ` · reversed=${report.shuffled.map((f) => `${f.t}:${f.hash}`).join(',')}`
    );
    window.__ready = true;
    return;
  }

  if (params.has('still')) {
    const t = Number(params.get('t') ?? 0) || 0;
    stage.renderAt(t);
    const stats = stage.stats();
    const px = pixelStats(canvas);
    window.__pixelStats = px;
    msg(
      `still ${doc.id}/${shot.id} t=${t}s tri=${stats.triangles} draw=${stats.calls} ` +
        `mean=${px.mean.toFixed(1)} unique=${px.unique} dark=${px.darkRatio.toFixed(3)}`
    );
    window.__ready = true;
    return;
  }

  mountPreview({ doc, stage, shot: resolved, autoplay: !params.has('export') });
  window.__ready = true;

  // 自动化验证钩子：?export=1 直接跑一遍导出；?post=1 把结果回传给本地验证服务
  if (params.has('export')) {
    const started = performance.now();
    exportMp4({
      canvas: stage.renderer.domElement as HTMLCanvasElement,
      width: doc.output.width,
      height: doc.output.height,
      fps: doc.output.fps,
      duration: shot.duration,
      renderAt: (t) => stage.renderAt(t)
    })
      .then((result) => {
        const seconds = Number(((performance.now() - started) / 1000).toFixed(2));
        msg(`EXPORT_OK bytes=${result.blob.size} codec=${result.codec} frames=${result.frames} seconds=${seconds}`);
        if (params.has('post')) {
          void fetch('/result', {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: JSON.stringify({ ok: true, bytes: result.blob.size, codec: result.codec, frames: result.frames, seconds })
          }).catch(() => undefined);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        msg(`EXPORT_FAIL ${message}`);
        if (params.has('post')) {
          void fetch('/result', {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
            body: JSON.stringify({ ok: false, error: message })
          }).catch(() => undefined);
        }
      });
  }
}

try {
  boot();
} catch (err) {
  const text = err instanceof Error ? err.message : String(err);
  msg(`启动失败：${text}`);
  const status = document.getElementById('status');
  if (status) status.textContent = 'BOOT_FAIL';
}
