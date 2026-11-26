// 세상의 "지도" — 물가 선, 오솔길, 걸을 수 있는 구역, 건물 위치 등
// 다른 파일들은 모두 여기 정의된 값을 참고한다.

export const WATER_LEVEL = 0;

// 플레이어가 걸어 다닐 수 있는 타원형 구역 (가로 반지름 rx, 세로 반지름 rz)
export const WALK_AREA = { cx: 95, cz: 0, rx: 125, rz: 195 };

// 땅 높이를 미리 계산해 두는 지역 (풀·물가 효과에 쓰임) — 1m 간격
export const DETAIL = { minX: -170, minZ: -260, size: 512 };

// 가까운 쪽(동쪽) 물가 선의 x 좌표
export function shoreX(z) {
  return 10 * Math.sin(z * 0.011) + 7 * Math.sin(z * 0.027 + 1.3) + 3.5 * Math.sin(z * 0.061 + 2.0);
}

// 건너편(서쪽) 물가 선의 x 좌표
export function farShoreX(z) {
  return -560 + 30 * Math.sin(z * 0.006 + 0.5) + 14 * Math.sin(z * 0.017);
}

// 오솔길 경로 (물가를 따라 구불구불)
export const PATH_POINTS = [
  [40, -215], [34, -170], [42, -125], [30, -82], [36, -42],
  [52, -8], [44, 30], [34, 62], [48, 100], [70, 132],
  [62, 170], [72, 215],
];
// 언덕 위로 올라가는 갈림길
export const PATH_BRANCH = [
  [44, 30], [72, 38], [102, 52], [128, 46], [150, 60],
];

// 보트하우스 (물가 쪽으로 앞문이 열림). z 위치만 정하면 x는 물가에 맞춰 계산된다.
export const BOATHOUSES = [
  { z: -60, offset: -1.5, rotJitter: 0.05, size: 1.0 },
  { z: -18, offset: -1.0, rotJitter: -0.06, size: 0.85 },
  { z: 82, offset: -1.8, rotJitter: 0.04, size: 1.1 },
];

// 작은 나무배 (물에 떠 있음)
export const BOAT = { z: -40, out: 9, rot: 0.5 };

// 폭포 — 건너편 절벽에서 피오르로 떨어진다 (z 위치)
export const WATERFALLS = [
  { side: 'far', z: -165 },
  { side: 'far', z: 55 },
];

// 나무·바위를 놓지 않을 빈 자리 (동물 등장 지점, 건물 주변 등)
export const CLEARINGS = []; // 다른 파일에서 채워 넣음
