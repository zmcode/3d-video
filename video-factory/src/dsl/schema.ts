export type Vec3 = [number, number, number];

export interface Output {
  width: number;
  height: number;
  fps: number;
}

export type NodeType = 'box' | 'cylinder' | 'cone' | 'sphere' | 'torus' | 'gear' | 'text' | 'arrow';

export interface SceneNode {
  id: string;
  type: NodeType;
  material: string;
  /** 挂到另一个节点下（局部坐标） */
  parent?: string;
  at?: Vec3;
  /** 欧拉角，单位：度 */
  rot?: Vec3;
  scale?: number | Vec3;
  /** 是否绘制描边，默认 true */
  outline?: boolean;

  // 几何参数（按 type 取用）
  size?: Vec3;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  height?: number;
  segments?: number;
  tube?: number;
  /** gear：齿数 */
  teeth?: number;
  /** gear：厚度 */
  thickness?: number;
  /** text：文字内容 */
  text?: string;
  /** arrow：起止点 */
  from?: Vec3;
  to?: Vec3;
}

export type Ease = 'linear' | 'outCubic' | 'inOutCubic' | 'outBack';

export interface Motion {
  node: string;
  type: 'spin' | 'bob' | 'explode' | 'scaleIn' | 'track';
  axis?: 'x' | 'y' | 'z';
  /** spin：圈数 */
  turns?: number;
  /** bob：振幅（世界单位） */
  amplitude?: number;
  /** bob：周期（秒） */
  period?: number;
  /** explode：位移距离 */
  distance?: number;
  /** 时间窗（秒）；scaleIn 用它表示出现的起止时间 */
  from?: number;
  to?: number;
  /** track：数值或位置关键帧 */
  keys?: { t: number; v: number | Vec3 }[];
  ease?: Ease;
}

export interface Framing {
  /** 水平角（度），0 = +Z 方向 */
  azimuth?: number;
  /** 俯仰角（度） */
  elev?: number;
  /** 距离倍数：1 = 恰好框住 subject 包围球 */
  dist?: number;
  /** 留白系数：1 = 紧贴，1.15 = 留 15% */
  fit?: number;
  target?: Vec3;
}

export interface Camera {
  framing?: Framing;
  position?: Vec3;
  target?: Vec3;
  fov?: number;
}

export interface Shot {
  id: string;
  duration: number;
  /** 本镜独有节点；可与节点库同 id 覆盖 */
  nodes: SceneNode[];
  /** 取景与校验的核心对象 */
  subject?: string[];
  motion?: Motion[];
  camera?: Camera;
  light?: string;
  background?: 'gradient' | 'flat' | 'grid';
  note?: string;
}

export interface SceneDoc {
  id: string;
  output: Output;
  /** 节点库：跨分镜复用的节点定义 */
  nodes?: SceneNode[];
  shots: Shot[];
}
