// 부딪히는 물체 목록 (나무 줄기, 바위, 건물). 칸으로 나눠 빠르게 찾는다.
const CELL = 8;
const grid = new Map();
const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;

function insert(c, minX, minZ, maxX, maxZ) {
  const M = 1; // 플레이어 몸 두께만큼 여유
  minX -= M; minZ -= M; maxX += M; maxZ += M;
  for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++) {
    for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
      const k = key(cx, cz);
      let list = grid.get(k);
      if (!list) grid.set(k, (list = []));
      list.push(c);
    }
  }
}

export function addCircle(x, z, r) {
  insert({ type: 'c', x, z, r }, x - r, z - r, x + r, z + r);
}

// 회전된 상자 (hx, hz = 반 크기, rot = y축 회전)
export function addBox(x, z, hx, hz, rot) {
  const R = Math.hypot(hx, hz);
  insert({ type: 'b', x, z, hx, hz, cos: Math.cos(rot), sin: Math.sin(rot) }, x - R, z - R, x + R, z + R);
}

// 점(x,z)에 반지름 pr인 원(플레이어)이 무언가와 겹치는가?
export function blocked(x, z, pr) {
  const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!list) return false;
  for (const c of list) {
    if (c.type === 'c') {
      const dx = x - c.x, dz = z - c.z, rr = c.r + pr;
      if (dx * dx + dz * dz < rr * rr) return true;
    } else {
      const dx = x - c.x, dz = z - c.z;
      // 상자 좌표계로 돌리기
      const lx = dx * c.cos - dz * c.sin;
      const lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) < c.hx + pr && Math.abs(lz) < c.hz + pr) return true;
    }
  }
  return false;
}
