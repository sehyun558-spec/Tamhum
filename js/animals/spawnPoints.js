// 다음 단계에서 동물이 나타날 자리 목록
// - x, z: 위치 (미터). 높이(y)는 땅 높이에 맞춰 자동 계산된다.
// - facing: 동물이 바라볼 방향 (라디안, 0 = 북쪽(-z))
// - clearRadius: 이 반경 안에는 나무·바위를 놓지 않아 동물이 잘 보이게 비워 둔다
// - candidates: 이 자리에 어울리는 동물 후보 (나중에 GLB 모델 파일 이름과 연결)
import { shoreX, BOATHOUSES } from '../world/layout.js';

const bh = BOATHOUSES[2];

export const ANIMAL_SPOTS = [
  {
    id: 'meadow',
    name: '넓은 풀밭',
    x: 108, z: -78,
    facing: 0.6,
    clearRadius: 9,
    candidates: ['red_deer', 'hare'],
  },
  {
    id: 'shore_rock',
    name: '물가의 이끼 바위',
    x: shoreX(-118) + 1.5, z: -118,
    facing: -1.6,
    clearRadius: 6,
    candidates: ['otter', 'grey_heron'],
    landmarkRock: true, // 이 자리에 큰 바위가 놓인다
  },
  {
    id: 'boathouse',
    name: '보트하우스 옆',
    x: shoreX(bh.z) + 11, z: bh.z + 9,
    facing: -2.2,
    clearRadius: 6,
    candidates: ['red_fox', 'white_wagtail'],
  },
  {
    id: 'birch_edge',
    name: '자작나무 숲 가장자리',
    x: 152, z: 8,
    facing: -1.2,
    clearRadius: 7,
    candidates: ['moose', 'roe_deer'],
  },
  {
    id: 'hill_view',
    name: '언덕 위 전망',
    x: 156, z: 66,
    facing: -1.9,
    clearRadius: 8,
    candidates: ['reindeer', 'golden_eagle'],
  },
  {
    id: 'water_meadow',
    name: '물가 풀밭',
    x: shoreX(160) + 14, z: 160,
    facing: -1.4,
    clearRadius: 8,
    candidates: ['eurasian_lynx', 'black_grouse'],
  },
];
