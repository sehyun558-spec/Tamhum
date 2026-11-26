// 사람의 흔적: 풀 지붕 빨간 보트하우스, 작은 나무 배, 나무 선착장
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './noise.js';
import { heightAt } from './terrain.js';
import { shoreX, BOATHOUSES, BOAT, CLEARINGS } from './layout.js';
import { patchMaterial, mergeColored, jitter } from './shaderBits.js';
import { addBox, addCircle } from './colliders.js';

const C = (h) => new THREE.Color(h);
const RED = C('#9c2f25'), RED_D = C('#7d241d'), WHITE = C('#efe9dc'), DOOR = C('#4a2a22');
const SOD = C('#5f8a3a'), SOD_D = C('#4a6e2e'), STONE = C('#77797a'), POST = C('#4b3a2c'), PLANK = C('#8b7358');

function box(w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1));
  return { geo: new THREE.BoxGeometry(w, h, d), matrix: m, color };
}

// 보트하우스 한 채 (지역 좌표: -x 쪽이 물을 향한 앞문)
function boathouseGeometry(rand, floorToGround) {
  const parts = [];
  const L = 9, Wd = 5.4, H = 2.7, ridge = 2.0, hw = Wd / 2;
  // 기초: 뒤쪽은 돌, 앞쪽은 나무 기둥
  parts.push(box(L * 0.55, floorToGround + 0.6, Wd + 0.2, L * 0.2, -floorToGround / 2 - 0.3 + 0.05, 0, STONE));
  for (const px of [-L / 2 + 0.2, -L / 2 + 1.8]) for (const pz of [-hw + 0.2, 0, hw - 0.2]) {
    parts.push(box(0.22, 3.2, 0.22, px, -1.55, pz, POST));
  }
  // 옆벽 + 세로 덧댄 판자
  for (const s of [-1, 1]) {
    parts.push(box(L, H, 0.14, 0, H / 2, s * hw, RED));
    for (let i = 0; i < 9; i++) parts.push(box(0.07, H, 0.06, -L / 2 + 0.5 + i * 1.0, H / 2, s * (hw + 0.08), RED_D));
  }
  // 앞·뒤 박공벽 (오각형)
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0); shape.lineTo(hw, 0); shape.lineTo(hw, H); shape.lineTo(0, H + ridge); shape.lineTo(-hw, H); shape.closePath();
  for (const s of [-1, 1]) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: false });
    const m = new THREE.Matrix4().makeRotationY(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(s * L / 2 - (s > 0 ? 0.14 : 0), 0, 0));
    parts.push({ geo: g, matrix: m, color: RED });
  }
  // 큰 문 (물 쪽) + 흰 테두리
  const fx = -L / 2 - 0.06;
  parts.push(box(0.06, 2.3, 3.0, fx, 1.15, 0, DOOR));
  parts.push(box(0.04, 2.3, 0.05, fx - 0.03, 1.15, 0, WHITE));
  parts.push(box(0.1, 0.14, 3.3, fx - 0.02, 2.37, 0, WHITE));
  for (const s of [-1, 1]) parts.push(box(0.1, 2.4, 0.14, fx - 0.02, 1.2, s * 1.57, WHITE));
  // 뒤쪽 작은 창문
  parts.push(box(0.06, 0.7, 0.7, L / 2 + 0.06, H + 0.6, 0, WHITE));
  parts.push(box(0.08, 0.55, 0.55, L / 2 + 0.08, H + 0.6, 0, C('#2c3438')));
  // 모서리 흰 테
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.14, H, 0.14, sx * (L / 2 - 0.02), H / 2, sz * (hw + 0.02), WHITE));
  // 박공 흰 처마 판
  const ang = Math.atan2(ridge, hw + 0.6), slant = Math.hypot(ridge, hw + 0.6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push(box(0.08, 0.16, slant, sx * (L / 2 + 0.32), H + ridge / 2 + 0.12, sz * (hw + 0.6) / 2, WHITE, sz * ang, 0, 0));
  }
  // 풀 지붕: 두 장의 두꺼운 흙판 + 위에 울퉁불퉁한 풀
  for (const s of [-1, 1]) {
    const roof = new THREE.BoxGeometry(L + 0.7, 0.32, slant + 0.05, 6, 1, 3);
    jitter(roof, 0.12, rand);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(0, H + ridge / 2 + 0.22, s * (hw + 0.6) / 2),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(s * ang, 0, 0)),
      new THREE.Vector3(1, 1, 1));
    parts.push({ geo: roof, matrix: m, colorFn: (c, p, k, g) => {
      const ny = g.attributes.normal.getY(k);
      c.copy(SOD_D).lerp(SOD, rand() * 0.8);
      if (ny < 0.3) c.lerp(C('#4b3b2c'), 0.6); // 흙 단면
    } });
  }
  // 용마루를 덮는 풀 덩어리
  const crest = new THREE.CylinderGeometry(0.28, 0.28, L + 0.6, 6, 4);
  jitter(crest, 0.12, rand);
  parts.push({ geo: crest, matrix: new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0, H + ridge + 0.2, 0)), color: SOD });
  return mergeColored(parts);
}

function boatGeometry() {
  const nS = 14, nP = 9, L = 3.8;
  const pos = [], col = [], idx = [];
  const wood = C('#9b6a3e'), woodD = C('#6e4a2b'), stripe = C('#e9e3d3');
  for (let i = 0; i <= nS; i++) {
    const u = (i / nS) * 2 - 1;
    const w = 0.72 * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.12 * u * u);
    const dep = 0.42 * (1 - 0.35 * u * u);
    const sheer = 0.18 * u * u;
    for (let j = 0; j <= nP; j++) {
      const phi = (j / nP) * Math.PI - Math.PI / 2;
      const x = w * Math.sin(phi);
      const y = -dep * Math.pow(Math.cos(phi), 0.7) + sheer + 0.1;
      pos.push(x, y, (u * L) / 2);
      const top = Math.abs(Math.sin(phi)) > 0.92;
      const c = top ? stripe : wood.clone().lerp(woodD, Math.abs(Math.sin(phi * 3 + u * 2)) * 0.3);
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 0; i < nS; i++) for (let j = 0; j < nP; j++) {
    const a = i * (nP + 1) + j, b = a + 1, c = a + nP + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  hull.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const parts = [
    box(1.05, 0.06, 0.28, 0, 0.0, -0.4, C('#b48a5c')),
    box(1.2, 0.06, 0.28, 0, 0.0, 0.6, C('#b48a5c')),
    box(0.06, 0.04, 2.2, 0.12, 0.08, 0.1, C('#c7a173'), 0, 0.08, 0), // 노
  ];
  const seats = mergeColored(parts);
  return { hull, seats };
}

export function buildStructures() {
  const rand = mulberry32(4242);
  const group = new THREE.Group();
  group.name = 'structures';
  const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), { cloud: true });
  const floors = [];
  const updaters = [];

  for (const bh of BOATHOUSES) {
    const z = bh.z, s0 = shoreX(z);
    const slope = (shoreX(z + 0.5) - shoreX(z - 0.5));
    const rot = Math.atan(slope) + bh.rotJitter;
    const cx = s0 + 1.0 + bh.offset;
    const back = heightAt(cx + Math.cos(rot) * 4.5 * bh.size, z - Math.sin(rot) * 4.5 * bh.size);
    const floorY = Math.max(0.35, back - 0.25);
    const geo = boathouseGeometry(rand, floorY + 0.4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, floorY, z);
    mesh.rotation.y = rot;
    mesh.scale.setScalar(bh.size);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    addBox(cx, z, 4.6 * bh.size, 2.85 * bh.size, rot);
    CLEARINGS.push({ x: cx, z, r: 7 * bh.size });
  }

  // 선착장 + 배
  const pz = BOAT.z, ps = shoreX(pz);
  const pierW = 1.7;
  const pierParts = [];
  for (let i = 0; i < 52; i++) {
    pierParts.push(box(0.19, 0.07, pierW, -i * 0.205, 0.0, 0, PLANK.clone().multiplyScalar(0.8 + rand() * 0.35)));
  }
  // 판자 아래 받침 기둥 (가로 들보)
  for (const s of [-1, 1]) pierParts.push(box(10.7, 0.16, 0.14, -5.2, -0.12, s * (pierW / 2 - 0.12), POST));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) pierParts.push(box(0.16, 3, 0.16, -i * 3.3 - 0.3, -1.5, s * (pierW / 2 - 0.05), POST));
  pierParts.push(box(0.2, 1.0, 0.2, -10.5, 0.45, pierW / 2 - 0.1, POST)); // 배 묶는 기둥
  const pier = new THREE.Mesh(mergeColored(pierParts), mat);
  const pierY = 0.75;
  const pierX = ps + 3.6;
  pier.position.set(pierX, pierY, pz);
  pier.castShadow = true;
  pier.receiveShadow = true;
  group.add(pier);
  floors.push({ x: pierX - 5.1, z: pz, hx: 5.4, hz: pierW / 2 - 0.12, rot: 0, y: pierY + 0.04 });
  addCircle(pierX - 10.5, pz + pierW / 2 - 0.1, 0.2);
  CLEARINGS.push({ x: ps + 2, z: pz, r: 4 });

  const { hull, seats } = boatGeometry();
  const boat = new THREE.Group();
  const bmat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), { cloud: true });
  const hm = new THREE.Mesh(hull, bmat); hm.castShadow = true; hm.receiveShadow = true;
  const sm = new THREE.Mesh(seats, mat); sm.castShadow = true;
  boat.add(hm, sm);
  const bx = pierX - 8.6, bz = pz + pierW / 2 + 1.1;
  boat.position.set(bx, 0, bz);
  boat.rotation.y = Math.PI / 2 + 0.12;
  group.add(boat);
  updaters.push((t) => {
    boat.position.y = Math.sin(t * 0.9) * 0.035 - 0.02;
    boat.rotation.z = Math.sin(t * 0.7 + 1) * 0.025;
    boat.rotation.x = Math.sin(t * 0.55) * 0.015;
    boat.rotation.y = Math.PI / 2 + 0.12 + Math.sin(t * 0.13) * 0.05;
  });

  group.userData.update = (t) => updaters.forEach((f) => f(t));
  return { group, floors };
}
