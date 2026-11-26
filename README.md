# 북쪽 길 사진 여행 (1단계)

폰 브라우저에서 돌아가는 3D 힐링 탐험 게임. 이번 단계는 **노르웨이 피오르를 걸어 다니는 세상**까지.

- Three.js **0.160.0** (r160) 고정 — `js/vendor/three.module.min.js`에 들어 있어서 인터넷 CDN 없이 돌아감
- 빌드 과정 없음. `index.html`을 웹 서버에 그대로 올리면 끝 (GitHub Pages)

## 조작
| | 폰 | 컴퓨터 |
|---|---|---|
| 걷기 | 화면 왼쪽 아래를 엄지로 밀기 | W A S D (Shift = 조금 빨리) |
| 둘러보기 | 화면 오른쪽을 손가락으로 밀기 | 화면 클릭 후 마우스 (Esc로 해제), 또는 드래그 |
| 메뉴 | 오른쪽 위 ≡ 버튼 | M 키 |

## 파일 구성 (역할별)
```
index.html            화면 뼈대
css/style.css         시작 화면·조이스틱·메뉴 모양
js/main.js            시작점: 렌더러, 매 프레임 그리기, 자동 화질 조절
js/world/             세상 만들기
  layout.js           지도 (물가 선, 오솔길, 걷는 구역, 보트하우스·폭포 위치)
  terrain.js          땅 높이·색, 지형
  sky.js              하늘, 햇빛, 안개, 그림자
  water.js            피오르 물
  vegetation.js       침엽수, 자작나무, 바위, 루피너스, 데이지
  grass.js            바람에 흔들리는 풀
  structures.js       보트하우스, 선착장, 나무배
  waterfall.js        폭포와 물보라
  ambience.js         떠다니는 빛 먼지
  shaderBits.js       바람·구름 그림자 공용 셰이더
  colliders.js        부딪힘 판정
js/controls/          조작
  input.js            조이스틱, 터치, 키보드, 마우스
  player.js           걷기, 땅 따라가기, 물·절벽 막기, 걸음 흔들림
js/ui/screens.js      화면 (시작 화면, 햇살 전환, 메뉴)
js/animals/           나중에 동물
  spawnPoints.js      동물 등장 지점 6곳 목록
  animals.js          동물 불러오기 자리 (지금은 비어 있음)
```

## 확인용 주소 옵션
- `?play` — 시작 화면 건너뛰기
- `?spots` — 동물 등장 지점을 노란 기둥으로 표시
