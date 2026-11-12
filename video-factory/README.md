# video-factory · 程序化 3D 解说视频工厂（M0）

用**数据 + 代码**生成风格化 3D 画面，浏览器实时预览，WebCodecs 直出 MP4。
不需要美术素材、不需要手工摆场景、不需要 ffmpeg。

完整设计与路线见 `../3D解说视频工厂-设计文档.md`。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 类型检查 + 生产构建
npm run verify     # 无头 Chrome 跑一次导出，回执 {ok, bytes, codec, frames, seconds}
```

实测（1280×720@30fps，软件渲染）：6 秒成片端到端 **2.37 s**，输出 **1.32 MB**，H.264 `avc1.4d0034`。

## 怎么写一条片子

场景是一个 JSON（YAML 1.2 是 JSON 超集，后续可直接换成 YAML）：

```json
{
  "id": "demo",
  "output": { "width": 1280, "height": 720, "fps": 30 },
  "nodes": [
    { "id": "g1", "type": "gear", "teeth": 18, "radius": 1, "thickness": 0.34, "material": "toon_steel" }
  ],
  "shots": [
    {
      "id": "s01",
      "duration": 6,
      "subject": ["g1"],
      "light": "rim_soft",
      "motion": [{ "node": "g1", "type": "spin", "axis": "z", "turns": 0.5 }],
      "camera": { "fov": 35, "framing": { "azimuth": 26, "elev": 15, "fit": 1.1 } }
    }
  ]
}
```

- `nodes` 是**节点库**，跨分镜复用；分镜里的同 id 节点只写差异字段即可覆盖。
- `subject` 决定取景与阴影范围（地面、环境不要放进去）。
- `camera.framing` 由 subject 包围球自动求机位 → 换素材不用重调数字。

## 加一个"新东西"分别改哪里

| 想加 | 改哪 |
|---|---|
| 材质 | `src/presets/materials.ts`（色板 token + 色阶） |
| 光效 | `src/presets/lights.ts`（环境光 + 1~2 盏方向光） |
| 几何类型 | `src/engine/geometry.ts`（参数化函数） |
| 运动 | `src/engine/motion.ts`（遵守"从基准变换重算"） |
| 分镜 | `scenes/*.json` |

原则：能在数据里表达的不要写进引擎；能参数化的不要建模型。

## 自动化自检

| URL | 作用 |
|---|---|
| `?still=1&t=1.2` | 只渲一帧，页面提示区输出 `mean/unique/dark/tri/draw`，可用于判断是否黑屏 |
| `?selftest=1` | 正序/倒序渲染 5 个时间点并比对像素哈希，输出 `SELFTEST PASS/FAIL` |
| `?shot=s02` | 指定分镜 |
| `?export=1` | 自动导出一次，结果写进提示区 |
| `?export=1&post=1` | 导出并把回执 POST 给 `tools/verify.mjs` |

## 已知边界（M0）

- 无音频、无字幕、无转场、无多镜拼接（M2）
- 无 glTF 接入（M3），主体目前只有参数化几何
- 无累积抗锯齿与后处理链（M4）
- 相机为静态机位，画面运动来自场景自身动画
