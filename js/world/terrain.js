// 땅 만들기: 높이 계산, 지형 메시, 색칠, 풀/물가용 높이 지도
import * as THREE from '../vendor/three.module.min.js';
import { fbm, ridged, smoothstep, clamp, lerp, valueNoise } from './noise.js';
import { shoreX, farShoreX, DETAIL, PATH_POINTS, PATH_BRANCH } from './layout.js';
import { patchMaterial } from './shaderBits.js';

// ---------------------------------------------------------------
// 오솔길 지도: 1m 간격 격자에 "길과의 거리"를 미리 계산해 둔다
// ---------------------------------------------------------------
const N = DETAIL.size;
const pathDist = new Float32Array(N * N).fill(99);

function catmull(points, samplesPerSeg = 12) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i];
    const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function rasterPath(pts, width) {
  const M = 5;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const x0 = Math.floor(Math.min(ax, bx) - M - DETAIL.minX), x1 = Math.ceil(Math.max(ax, bx) + M - DETAIL.minX);
    const z0 = Math.floor(Math.min(az, bz) - M - DETAIL.minZ), z1 = Math.ceil(Math.max(az, bz) + M - DETAIL.minZ);
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
    for (let gz = Math.max(0, z0); gz <= Math.min(N - 1, z1); gz++) {
      for (let gx = Math.max(0, x0); gx <= Math.min(N - 1, x1); gx++) {
        const px = gx + DETAIL.minX, pz = gz + DETAIL.minZ;
        const t = clamp(((px - ax) * dx + (pz - az) * dz) / len2, 0, 1);
        const qx = ax + dx * t - px, qz = az + dz * t - pz;
        // 길 폭을 조금씩 달리해서 자연스럽게
        const d = Math.sqrt(qx * qx + qz * qz) / width;
        const k = gz * N + gx;
        if (d < pathDist[k]) pathDist[k] = d;
      }
    }
  }
}
export const PATH_CURVE = catmull(PATH_POINTS);
export const PATH_BRANCH_CURVE = catmull(PATH_BRANCH);
rasterPath(PATH_CURVE, 1.0);
rasterPath(PATH_BRANCH_CURVE, 0.8);

function sampleGrid(arr, x, z, outside) {
  const fx = x - DETAIL.minX, fz = z - DETAIL.minZ;
  if (fx < 0 || fz < 0 || fx >= N - 1 || fz >= N - 1) return outside;
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
  const k = iz * N + ix;
  const a = arr[k], b = arr[k + 1], c = arr[k + N], d = arr[k + N + 1];
  return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
}

// 0~1: 길 위면 1
export function pathMask(x, z) {
  const d = sampleGrid(pathDist, x, z, 99);
  const wob = valueNoise(x * 0.15, z * 0.15) * 0.5;
  return 1 - smoothstep(0.9 + wob, 1.9 + wob, d);
}

// ---------------------------------------------------------------
// 높이 함수 — 세상의 모든 땅 높이는 여기서 나온다
// ---------------------------------------------------------------
export function heightAt(x, z) {
  const d = x - shoreX(z);      // 가까운 물가에서 육지 쪽으로의 거리
  const d2 = farShoreX(z) - x;  // 건너편 물가에서 육지 쪽으로의 거리
  let h;

  if (d >= 0) {
    // --- 우리 쪽 물가: 자갈 해변 → 풀밭 언덕 → 절벽 ---
    const beach = 1.5 * smoothstep(0, 12, d) + d * 0.04;
    let hills = fbm(x * 0.011 + 3.1, z * 0.011, 4) * 8 * smoothstep(18, 70, d);
    if (hills < 0) hills *= 0.3; // 움푹 꺼진 곳이 물 높이보다 낮아지지 않게 얕게
    const bumps = fbm(x * 0.05, z * 0.05, 3) * 1.1 * smoothstep(5, 22, d);
    const cs = 205 + fbm(z * 0.004, 3.3, 3) * 40;
    const ct = smoothstep(cs, cs + 85, d);
    const cliff = ct * (235 + fbm(z * 0.003, 8.1, 3) * 60);
    const ledges = ridged(x * 0.02, z * 0.02, 3) * 28 * ct * (1 - ct) * 4;
    const beyond = Math.max(0, d - 320) * 0.18;
    h = beach + hills + bumps + cliff + ledges + beyond + 1.2 * smoothstep(10, 35, d);
    if (d > 6) h = Math.max(h, 0.7 + (d - 6) * 0.02);
    // 길은 살짝 다져진 느낌
    const pm = pathMask(x, z);
    if (pm > 0) h -= pm * (0.18 + bumps * 0.3);
  } else if (d2 >= 0) {
    // --- 건너편: 물에서 바로 솟는 초록 절벽 ---
    const t = smoothstep(-2, 170, d2);
    const terr = Math.pow(t, 0.75) * (330 + fbm(z * 0.003, 1.7, 3) * 70);
    const ledges = ridged(x * 0.015 + 4, z * 0.015, 3) * 40 * t * (1 - t) * 4;
    h = terr + ledges + Math.max(0, d2 - 200) * 0.15 + d2 * 0.1;
  } else {
    // --- 피오르 물 밑 ---
    const depth = Math.min(-d, -d2);
    h = -Math.min(depth * 0.32, 38) + fbm(x * 0.02, z * 0.02, 2) * 1.2 * smoothstep(0, 10, depth);
  }

  // 먼 산맥 (눈 덮인 봉우리)
  const ad = Math.abs(z);
  const mtnMask = Math.max(smoothstep(420, 1000, d), smoothstep(450, 1150, d2), smoothstep(1300, 2100, ad));
  if (mtnMask > 0) {
    const r = ridged(x * 0.0014 + 7, z * 0.0014, 5);
    h += mtnMask * (r * 700 + 120);
  }
  // 피오르 양 끝을 막는 산
  const endRise = smoothstep(1300, 2200, ad);
  if (endRise > 0) h = lerp(h, Math.max(h, 260), endRise);
  return h;
}

// 경사도(0=평지, 1=수직에 가까움)
export function slopeAt(x, z) {
  const e = 0.75;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  return Math.sqrt(dx * dx + dz * dz) / (2 * e);
}

// ---------------------------------------------------------------
// 풀 밀도 (0~1): 풀밭에서 높고, 길·물가·절벽에선 0
// ---------------------------------------------------------------
export function grassDensity(x, z, h, slope, pm) {
  const d = x - shoreX(z);
  if (d < 2.5 || h < 0.6) return 0;
  let g = smoothstep(2.5, 9, d) * (1 - smoothstep(0.55, 0.9, slope)) * (1 - pm);
  g *= 1 - smoothstep(220, 260, d);
  g *= 0.55 + 0.45 * smoothstep(0.25, 0.6, valueNoise(x * 0.06 + 11, z * 0.06));
  return clamp(g, 0, 1);
}

// ---------------------------------------------------------------
// 지형 메시: 가운데(걷는 곳)는 촘촘하게, 멀수록 성기게
// ---------------------------------------------------------------
// 축 좌표 만들기: 구간마다 간격이 다르고, 맨 바깥은 점점 성기게
function axisCoords(segments, outer, ratio) {
  const out = [];
  for (const [from, to, step] of segments) {
    const n = Math.round((to - from) / step);
    for (let i = out.length ? 1 : 0; i <= n; i++) out.push(from + ((to - from) * i) / n);
  }
  let s = segments[0][2], v = out[0];
  const lo = [];
  while (v > -outer) { s *= ratio; v -= s; lo.unshift(v); }
  s = segments[segments.length - 1][2]; v = out[out.length - 1];
  while (v < outer) { s *= ratio; v += s; out.push(v); }
  return lo.concat(out);
}

const C = (hex) => new THREE.Color(hex);
const COL = {
  grassA: C('#5f8a3e'), grassB: C('#7a9f4a'), grassDry: C('#9aa860'),
  forest: C('#3f6a39'), moss: C('#557a3c'), cliffGreen: C('#58793f'),
  rock: C('#8a8d88'), rockDark: C('#6b706c'),
  pebble: C('#948e7e'), pebbleDark: C('#7c786c'), sandWet: C('#6f6a5c'), underwater: C('#3d5a4c'),
  path: C('#a48a63'), snow: C('#f4f6fb'), snowShade: C('#dfe6f2'),
};

export function buildTerrain() {
  const x0 = DETAIL.minX, x1 = DETAIL.minX + DETAIL.size, z0 = DETAIL.minZ, z1 = DETAIL.minZ + DETAIL.size;
  // 걷는 곳 2.5m, 건너편 절벽 6m, 뒤 절벽 7m, 그 밖은 점점 성기게
  const xs = axisCoords([[-800, x0, 7], [x0, x1, 2.5], [x1, 660, 7]], 3400, 1.15);
  const zs = axisCoords([[-800, z0, 10], [z0, z1, 2.5], [z1, 800, 10]], 3400, 1.15);
  const W = xs.length, H = zs.length;
  const pos = new Float32Array(W * H * 3);
  const col = new Float32Array(W * H * 3);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = (j * W + i) * 3;
      pos[k] = xs[i]; pos[k + 1] = heightAt(xs[i], zs[j]); pos[k + 2] = zs[j];
    }
  }
  const idx = new Uint32Array((W - 1) * (H - 1) * 6);
  // 타일 단위로 인덱스를 모아 둔다 (화면 밖 타일은 그리지 않기 위해)
  const TILE = 32;
  const tiles = [];
  let p = 0;
  for (let tj = 0; tj < H - 1; tj += TILE) {
    for (let ti = 0; ti < W - 1; ti += TILE) {
      const start = p;
      for (let j = tj; j < Math.min(tj + TILE, H - 1); j++) {
        for (let i = ti; i < Math.min(ti + TILE, W - 1); i++) {
          const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
          // 대각선 방향을 번갈아 → 덜 인위적인 면
          if ((i + j) & 1) { idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
          else { idx[p++] = a; idx[p++] = c; idx[p++] = d; idx[p++] = a; idx[p++] = d; idx[p++] = b; }
        }
      }
      tiles.push({ start, count: p - start, ti, tj });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal.array;

  const tmp = new THREE.Color();
  for (let v = 0; v < W * H; v++) {
    const x = pos[v * 3], h = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const ny = nrm[v * 3 + 1];
    const n1 = valueNoise(x * 0.08, z * 0.08), n2 = valueNoise(x * 0.013 + 5, z * 0.013);
    const d = x - shoreX(z);
    // 기본: 풀밭 색 (얼룩덜룩)
    tmp.copy(COL.grassA).lerp(COL.grassB, n1 * 0.8).lerp(COL.grassDry, smoothstep(0.6, 0.9, n2) * 0.5);
    // 높은 곳은 짙은 숲 색
    tmp.lerp(COL.forest, smoothstep(25, 90, h) * 0.85);
    // 경사가 급하면 이끼 낀 초록 → 아주 가파른 곳만 바위
    const steep = 1 - ny;
    const streak = valueNoise(x * 0.045 + z * 0.045, h * 0.012); // 절벽의 세로 줄무늬
    tmp.lerp(COL.cliffGreen, smoothstep(0.1, 0.3, steep) * 0.85);
    tmp.lerp(n1 > 0.5 ? COL.rock : COL.rockDark, smoothstep(0.5, 0.8, steep + (streak - 0.5) * 0.5) * 0.85);
    // 물가 자갈
    const beach = 1 - smoothstep(0.45, 1.1 + n1 * 0.4, h);
    tmp.lerp(n1 > 0.45 ? COL.pebble : COL.pebbleDark, beach * (d > -1 ? 1 : 0.6));
    if (h < 0.15) tmp.lerp(COL.sandWet, smoothstep(0.15, -0.6, h));
    if (h < -0.6) tmp.lerp(COL.underwater, smoothstep(-0.6, -5, h));
    // 오솔길
    const pm = pathMask(x, z);
    if (pm > 0) tmp.lerp(COL.path, pm * 0.92);
    // 눈
    const snowLine = 430 + n2 * 160;
    const snow = smoothstep(snowLine, snowLine + 60, h) * smoothstep(0.25, 0.55, ny);
    tmp.lerp(ny > 0.75 ? COL.snow : COL.snowShade, snow);
    col[v * 3] = tmp.r; col[v * 3 + 1] = tmp.g; col[v * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  patchMaterial(mat, { cloud: true });
  const group = new THREE.Group();
  group.name = 'terrain';
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const t of tiles) {
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', geo.attributes.position);
    tg.setAttribute('normal', geo.attributes.normal);
    tg.setAttribute('color', geo.attributes.color);
    tg.setIndex(new THREE.BufferAttribute(idx.subarray(t.start, t.start + t.count), 1));
    // 이 타일에 속한 정점만으로 경계 구 계산
    box.makeEmpty();
    for (let j = t.tj; j <= Math.min(t.tj + TILE, H - 1); j++) {
      for (let i = t.ti; i <= Math.min(t.ti + TILE, W - 1); i++) {
        const k = (j * W + i) * 3;
        box.expandByPoint(v.set(pos[k], pos[k + 1], pos[k + 2]));
      }
    }
    tg.boundingBox = box.clone();
    tg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    const mesh = new THREE.Mesh(tg, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.userData.stats = { verts: W * H, tris: idx.length / 3, tiles: tiles.length };
  return group;
}

// ---------------------------------------------------------------
// 풀·물에서 쓸 높이 지도 텍스처 (R=높이, G=풀 밀도, B=길)
// ---------------------------------------------------------------
export function buildDetailTexture() {
  const data = new Uint16Array(N * N * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const heights = new Float32Array(N * N);
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) heights[gz * N + gx] = heightAt(gx + DETAIL.minX, gz + DETAIL.minZ);
  }
  for (let gz = 0; gz < N; gz++) {
    for (let gx = 0; gx < N; gx++) {
      const k = gz * N + gx;
      const x = gx + DETAIL.minX, z = gz + DETAIL.minZ, h = heights[k];
      const hx = heights[k + (gx < N - 1 ? 1 : 0)] - heights[k - (gx > 0 ? 1 : 0)];
      const hz = heights[k + (gz < N - 1 ? N : 0)] - heights[k - (gz > 0 ? N : 0)];
      const slope = Math.sqrt(hx * hx + hz * hz) / 2;
      const pm = pathMask(x, z);
      data[k * 4] = toHalf(h);
      data[k * 4 + 1] = toHalf(grassDensity(x, z, h, slope, pm));
      data[k * 4 + 2] = toHalf(pm);
      data[k * 4 + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex, heights };
}
