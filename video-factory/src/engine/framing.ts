import * as THREE from 'three';
import type { Camera } from '../dsl/schema';

const DEG = Math.PI / 180;

export interface SolvedCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

/**
 * 取景求解：
 * - 给了 camera.position 就用绝对机位
 * - 否则按 subject 的包围球 + framing 参数推导
 * 这样换素材（bbox 变了）不需要人工重调 6 个数字。
 */
export function solveCamera(camera: Camera | undefined, box: THREE.Box3, aspect: number): SolvedCamera {
  const fov = camera?.fov ?? 35;

  const target = new THREE.Vector3();
  if (camera?.target) target.set(...camera.target);
  else if (camera?.framing?.target) target.set(...camera.framing.target);
  else box.getCenter(target);

  if (camera?.position) {
    return { position: new THREE.Vector3(...camera.position), target, fov };
  }

  const f = camera?.framing ?? {};
  const azimuth = (f.azimuth ?? 30) * DEG;
  // 夹到 ±85°：elev 接近 ±90° 时相机与 up 共线，lookAt 会退化
  const elev = Math.min(85, Math.max(-85, f.elev ?? 15)) * DEG;
  const dist = f.dist ?? 1;
  const fit = f.fit ?? 1.15;

  const sphere = box.isEmpty()
    ? new THREE.Sphere(new THREE.Vector3(), 1)
    : box.getBoundingSphere(new THREE.Sphere());
  // target 与包围球心不重合时，距离要额外加上偏移量，否则一侧被推出画面
  const radius = Math.max(0.2, sphere.radius) + sphere.center.distanceTo(target);

  const halfV = (fov * DEG) / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  const half = Math.min(halfV, halfH);

  const distance = (radius / Math.max(0.05, Math.sin(half))) * fit * dist;

  const position = new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elev),
    Math.sin(elev),
    Math.cos(azimuth) * Math.cos(elev)
  )
    .multiplyScalar(distance)
    .add(target);

  return { position, target, fov };
}
