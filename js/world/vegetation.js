// 나무(침엽수·자작나무), 바위, 꽃(루피너스·데이지) — 모두 인스턴싱으로 가볍게
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32, valueNoise, smoothstep, clamp } from './noise.js';
import { heightAt, slopeAt, pathMask, grassDensity } from './terrain.js';
import { shoreX, DETAIL, CLEARINGS } from './layout.js';
import { patchMaterial, mergeColored, jitter } from './shaderBits.js';
import { addCircle } from './colliders.js';

const C = (h) => new THREE.Color(h);
const M4 = new THREE.Matrix4();
const tr = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function inClearing(x, z, extra = 0) {
  for (const c of CLEARINGS) {
    const dx = x - c.x, dz = z - c.z, r = c.r + extra;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

function nearPath(x, z, r) {
  return pathMask(x, z) > 0.01 || pathMask(x + r, z) > 0.01 || pathMask(x - r, z) > 0.01 ||
    pathMask(x, z + r) > 0.01 || pathMask(x, z - r) > 0.01;
}

// 간단한 간격 유지용 해시
class Spacer {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  ok(x, z, r) {
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.map.get((cx + i) + ',' + (cz + j));
      if (l) for (const p of l) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < (r + p[2]) ** 2) return false;
    }
    return true;
  }
  add(x, z, r) {
    const k = Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell);
    let l = this.map.get(k); if (!l) this.map.set(k, (l = []));
    l.push([x, z, r]);
  }
}

// ------------------------------------------------------------------
// 나무 모양 만들기
// ------------------------------------------------------------------
function coniferGeometry(rand, detailed) {
  const parts = [];
  const leafDark = C('#34603a'), leafLight = C('#5d8d50');
  if (detailed) parts.push({ geo: new THREE.CylinderGeometry(0.16, 0.3, 3, 6), matrix: tr(0, 1.5, 0), color: C('#5b4332') });
  const tiers = detailed ? 4 : 2;
  for (let i = 0; i < tiers; i++) {
    const f = i / tiers;
    const r = (detailed ? 2.7 : 2.9) * (1 - f * 0.78);
    const h = (detailed ? 3.8 : 5.6) * (1 - f * 0.25);
    const y0 = (detailed ? 1.5 : 0.6) + i * (detailed ? 1.95 : 3.6);
    const g = new THREE.ConeGeometry(r, h, detailed ? 7 : 6, 1, true);
    if (detailed) jitter(g, 0.35, rand);
    parts.push({
      geo: g, matrix: tr(0, y0 + h / 2, 0),
      colorFn: (c, p, k) => { const t = (p.getY(k) + h / 2) / h; c.copy(leafLight).lerp(leafDark, Math.min(1, t * 1.4 + 0.1)); },
    });
  }
  return mergeColored(parts);
}

function birchGeometry(rand) {
  const parts = [];
  const bark = C('#ece8dc'), barkDark = C('#3b3833');
  const trunk = new THREE.CylinderGeometry(0.11, 0.19, 7.5, 6, 4);
  parts.push({
    geo: trunk, matrix: tr(0, 3.75, 0),
    colorFn: (c, p, k) => {
      const y = p.getY(k), a = Math.atan2(p.getZ(k), p.getX(k));
      const n = valueNoise(y * 2.3, a * 1.7);
      c.copy(bark).lerp(barkDark, n > 0.72 ? 0.85 : 0.0);
      if (y < -3.2) c.lerp(barkDark, 0.5);
    },
  });
  const leafA = C('#7fae4a'), leafB = C('#a9c95e');
  const blobs = [[0, 6.5, 0, 1.95], [0.85, 5.3, 0.5, 1.6], [-0.75, 5.6, -0.45, 1.55]];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 1);
    jitter(g, 0.45, rand);
    const m = new THREE.Matrix4().makeScale(1, 1.25, 1).premultiply(tr(x, y, z));
    parts.push({
      geo: g, matrix: m,
      colorFn: (c, p, k) => c.copy(leafA).lerp(leafB, clamp((p.getY(k) - y + r) / (2 * r), 0, 1) * 0.9),
    });
  }
  return mergeColored(parts);
}

function rockGeometry(rand) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  jitter(g, 0.42, rand);
  g.scale(1.1, 0.72, 1);
  g.translate(0, 0.2, 0);
  g.computeVertexNormals();
  const stone = C('#8a8e8a'), stoneDark = C('#676c6a'), moss = C('#5f8240');
  return mergeColored([{
    geo: g,
    colorFn: (c, p, k, geo) => {
      const ny = geo.attributes.normal.getY(k);
      c.copy(stone).lerp(stoneDark, valueNoise(p.getX(k) * 3, p.getZ(k) * 3 + p.getY(k) * 2));
      c.lerp(moss, smoothstep(0.35, 0.8, ny) * 0.85);
    },
  }]);
}

// ------------------------------------------------------------------
// 같은 모양을 여러 개 찍기. 넓은 범위는 구역(chunk)으로 나눠서
// 화면·그림자 밖 구역은 아예 그리지 않게 한다.
function makeInstanced(geo, mat, list, { shadow = false, receive = true, tint = 0.12, rand, chunk = 64 }) {
  const out = new THREE.Group();
  const buckets = new Map();
  for (const t of list) {
    const k = Math.floor(t.x / chunk) + ',' + Math.floor(t.z / chunk);
    let b = buckets.get(k); if (!b) buckets.set(k, (b = []));
    b.push(t);
  }
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  for (const items of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((t, i) => {
      e.set(t.tiltX || 0, t.rot, t.tiltZ || 0);
      q.setFromEuler(e);
      s.set(t.s * (t.sx || 1), t.s * (t.sy || 1), t.s * (t.sz || 1));
      p.set(t.x, t.y, t.z);
      M4.compose(p, q, s);
      mesh.setMatrixAt(i, M4);
      const v = 1 - tint / 2 + rand() * tint;
      col.setRGB(v * (0.97 + rand() * 0.06), v, v * (0.95 + rand() * 0.05));
      mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = receive;
    mesh.computeBoundingSphere();
    out.add(mesh);
  }
  return out;
}

export function buildVegetation(quality) {
  const rand = mulberry32(20240611);
  const group = new THREE.Group();
  group.name = 'vegetation';
  const treeMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { cloud: true, wind: 0.0016, flutter: 0.006 });
  const rockMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), { cloud: true });
  const flowerMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { cloud: true, wind: 0.09 });

  const spacer = new Spacer(6);
  const nearCon = [], nearBirch = [], farCon = [], rocks = [];

  // --- 바위 먼저 (큰 바위 자리 확보) ---
  for (const c of CLEARINGS) {
    if (c.landmarkRock) {
      const y = heightAt(c.x, c.z);
      rocks.push({ x: c.x, y: y - 0.5, z: c.z, s: 2.3, sy: 0.8, rot: 0.7 });
      addCircle(c.x, c.z, 2.1);
      spacer.add(c.x, c.z, 2.5);
    }
  }
  for (let tries = 0; tries < 5000 && rocks.length < 190; tries++) {
    const x = DETAIL.minX + 150 + rand() * 360, z = DETAIL.minZ + 6 + rand() * 500;
    const d = x - shoreX(z);
    if (d < -4) continue;
    const h = heightAt(x, z);
    // 물가와 절벽 아래에 많이
    const pref = d < 10 ? 0.6 : d > 170 ? 0.5 : 0.12;
    if (rand() > pref) continue;
    if (nearPath(x, z, 2) || inClearing(x, z, 1)) continue;
    let s = 0.3 + Math.pow(rand(), 2.5) * 2.4;
    if (d < 0) s *= 1.2;
    if (!spacer.ok(x, z, s)) continue;
    spacer.add(x, z, s);
    rocks.push({ x, y: h - s * 0.25, z, s, sy: 0.8 + rand() * 0.5, rot: rand() * 6.28, tiltX: (rand() - 0.5) * 0.3, tiltZ: (rand() - 0.5) * 0.3 });
    if (s > 0.55) addCircle(x, z, s * 0.95);
  }

  // --- 가까운 나무들 ---
  const maxCon = quality === 'low' ? 420 : 600, maxBirch = quality === 'low' ? 130 : 200;
  for (let tries = 0; tries < 26000 && (nearCon.length < maxCon || nearBirch.length < maxBirch); tries++) {
    const x = DETAIL.minX + 150 + rand() * 360, z = DETAIL.minZ + rand() * DETAIL.size;
    const d = x - shoreX(z);
    if (d < 7) continue;
    const h = heightAt(x, z);
    if (h < 1.2) continue;
    const slope = slopeAt(x, z);
    if (slope > 1.05) continue;
    const grove = smoothstep(0.5, 0.68, valueNoise(x * 0.018 + 2, z * 0.018));
    const cliffFoot = smoothstep(150, 215, d);
    const birchZone = smoothstep(0.45, 0.62, valueNoise(x * 0.025 + 9, z * 0.025 + 4)) * (1 - cliffFoot) * smoothstep(20, 50, d);
    const pCon = clamp(grove * 0.5 + cliffFoot * 0.65, 0, 0.9);
    const pBirch = birchZone * 0.55;
    const r = rand();
    const isBirch = r < pBirch;
    const isCon = !isBirch && r < pBirch + pCon;
    // 풀밭 군데군데 외로운 나무
    const lone = !isBirch && !isCon && rand() < 0.012 && d > 25;
    if (!isBirch && !isCon && !lone) continue;
    if (nearPath(x, z, 3) || inClearing(x, z, 2)) continue;
    const rad = isBirch ? 1.6 : 2.3;
    if (!spacer.ok(x, z, rad)) continue;
    const s = 0.75 + rand() * 0.6;
    const t = { x, y: h - 0.15, z, s, rot: rand() * 6.28, tiltX: (rand() - 0.5) * 0.06, tiltZ: (rand() - 0.5) * 0.06 };
    const asBirch = isBirch || (lone && rand() < 0.6);
    if (asBirch && nearBirch.length >= maxBirch) continue;
    if (!asBirch && nearCon.length >= maxCon) continue;
    spacer.add(x, z, rad);
    if (asBirch) { nearBirch.push(t); addCircle(x, z, 0.3 * s); }
    else { nearCon.push(t); addCircle(x, z, 0.45 * s); }
  }

  // --- 먼 숲 (절벽 위, 건너편 산비탈) ---
  const farTarget = quality === 'low' ? 2200 : 3600;
  for (let tries = 0; tries < 60000 && farCon.length < farTarget; tries++) {
    const x = -1400 + rand() * 2600, z = -1700 + rand() * 3400;
    const inDetail = x > DETAIL.minX && x < DETAIL.minX + DETAIL.size && z > DETAIL.minZ && z < DETAIL.minZ + DETAIL.size;
    if (inDetail) continue;
    const h = heightAt(x, z);
    if (h < 2 || h > 430) continue;
    const dens = smoothstep(0.35, 0.6, valueNoise(x * 0.008, z * 0.008 + 3)) * (1 - smoothstep(320, 430, h));
    if (rand() > dens) continue;
    const slope = slopeAt(x, z);
    if (slope > 1.15) continue;
    const s = 0.9 + rand() * 0.8;
    farCon.push({ x, y: h - 0.5, z, s, rot: rand() * 6.28 });
  }

  const conGeo = coniferGeometry(rand, true);
  const birchGeo = birchGeometry(rand);
  const farGeo = coniferGeometry(rand, false);
  group.add(makeInstanced(conGeo, treeMat, nearCon, { shadow: true, rand }));
  group.add(makeInstanced(birchGeo, treeMat, nearBirch, { shadow: true, rand }));
  group.add(makeInstanced(farGeo, treeMat, farCon, { shadow: false, receive: false, tint: 0.25, rand, chunk: 400 }));
  group.add(makeInstanced(rockGeometry(rand), rockMat, rocks, { shadow: true, tint: 0.2, rand }));

  // --- 꽃 ---
  const { lupins, daisies } = placeFlowers(rand, quality);
  group.add(makeInstanced(lupinGeometry(rand), flowerMat, lupins, { tint: 0.25, rand }));
  group.add(makeInstanced(daisyGeometry(), flowerMat, daisies, { tint: 0.08, rand }));

  group.userData.counts = { nearCon: nearCon.length, nearBirch: nearBirch.length, farCon: farCon.length, rocks: rocks.length, lupins: lupins.length, daisies: daisies.length };
  return group;
}

// ------------------------------------------------------------------
// 꽃
// ------------------------------------------------------------------
function lupinGeometry(rand) {
  const green = C('#4f7a37');
  const bottom = C('#5b3896'), top = C('#c3a5e6');
  const leaf = new THREE.CircleGeometry(0.17, 7);
  leaf.rotateX(-Math.PI / 2);
  jitter(leaf, 0.05, rand);
  const spike = new THREE.ConeGeometry(0.085, 0.46, 6, 3);
  jitter(spike, 0.03, rand);
  return mergeColored([
    { geo: new THREE.CylinderGeometry(0.015, 0.025, 0.55, 4), matrix: tr(0, 0.275, 0), color: green },
    { geo: leaf, matrix: tr(0, 0.12, 0), color: C('#3f6b2e') },
    { geo: spike, matrix: tr(0, 0.78, 0), colorFn: (c, p, k) => c.copy(bottom).lerp(top, clamp(p.getY(k) / 0.46 + 0.5, 0, 1)) },
  ]);
}

function daisyGeometry() {
  const stem = new THREE.BufferGeometry();
  stem.setAttribute('position', new THREE.Float32BufferAttribute([-0.008, 0, 0, 0.008, 0, 0, 0, 0.28, 0], 3));
  stem.computeVertexNormals();
  const head = new THREE.CircleGeometry(0.055, 8);
  head.rotateX(-Math.PI / 2 + 0.35);
  const eye = new THREE.CircleGeometry(0.02, 6);
  eye.rotateX(-Math.PI / 2 + 0.35);
  return mergeColored([
    { geo: stem, color: C('#4c7a35') },
    { geo: head, matrix: tr(0, 0.28, 0), color: C('#fbfbf4') },
    { geo: eye, matrix: tr(0, 0.284, 0.002), color: C('#f2c230') },
  ]);
}

function placeFlowers(rand, quality) {
  const lupins = [], daisies = [];
  const k = quality === 'low' ? 0.6 : 1;
  // 루피너스: 무리 지어 핀다
  let clusters = 0;
  for (let tries = 0; tries < 3000 && clusters < 34; tries++) {
    const cx = -10 + rand() * 230, cz = -200 + rand() * 400;
    const h = heightAt(cx, cz), d = cx - shoreX(cz);
    if (d < 5 || d > 190) continue;
    if (grassDensity(cx, cz, h, slopeAt(cx, cz), pathMask(cx, cz)) < 0.4) continue;
    clusters++;
    const n = Math.floor((25 + rand() * 45) * k), R = 2.5 + rand() * 4.5;
    for (let i = 0; i < n; i++) {
      const a = rand() * 6.283, r = Math.sqrt(rand()) * R;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r * 0.7;
      if (pathMask(x, z) > 0.05 || inClearing(x, z, -2)) continue;
      const hh = heightAt(x, z);
      lupins.push({ x, y: hh - 0.03, z, s: 0.7 + rand() * 0.6, sy: 0.8 + rand() * 0.6, rot: rand() * 6.28, tiltX: (rand() - 0.5) * 0.25, tiltZ: (rand() - 0.5) * 0.25 });
    }
  }
  // 데이지: 풀밭 곳곳에 흩어져
  const target = Math.floor(3800 * k);
  for (let tries = 0; tries < 40000 && daisies.length < target; tries++) {
    const x = -10 + rand() * 240, z = -205 + rand() * 410;
    const patch = smoothstep(0.4, 0.7, valueNoise(x * 0.04 + 7, z * 0.04));
    if (rand() > patch) continue;
    const h = heightAt(x, z);
    const g = grassDensity(x, z, h, 0.1, pathMask(x, z));
    if (g < 0.3) continue;
    daisies.push({ x, y: h - 0.02, z, s: 0.8 + rand() * 0.5, rot: rand() * 6.28 });
  }
  return { lupins, daisies };
}
