// 세상 만들기 총괄: 땅, 물, 하늘, 나무, 풀, 건물, 폭포, 빛 먼지를 한데 모은다
import * as THREE from '../vendor/three.module.min.js';
import { setupAtmosphere, followShadow } from './sky.js';
import { buildTerrain, buildDetailTexture, heightAt } from './terrain.js';
import { buildWater } from './water.js';
import { buildVegetation } from './vegetation.js';
import { buildGrass } from './grass.js';
import { buildStructures } from './structures.js';
import { buildWaterfalls } from './waterfall.js';
import { buildDust } from './ambience.js';
import { CLEARINGS } from './layout.js';
import { ANIMAL_SPOTS } from '../animals/spawnPoints.js';

export { heightAt };

// 단계별로 나눠 만들어서 로딩 중에도 화면이 멈추지 않게 한다
export async function buildWorld(scene, quality, onProgress = () => {}) {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const t0 = performance.now();

  for (const s of ANIMAL_SPOTS) CLEARINGS.push({ x: s.x, z: s.z, r: s.clearRadius, landmarkRock: !!s.landmarkRock });

  onProgress(0.05, '하늘을 칠하는 중');
  const atmo = setupAtmosphere(scene);
  await tick();

  onProgress(0.15, '땅을 빚는 중');
  const terrain = buildTerrain();
  scene.add(terrain);
  await tick();

  onProgress(0.35, '물을 채우는 중');
  const { texture: detailTex } = buildDetailTexture();
  scene.add(buildWater(detailTex));
  await tick();

  onProgress(0.5, '보트하우스를 짓는 중');
  const { group: structures, floors } = buildStructures();
  scene.add(structures);
  await tick();

  onProgress(0.6, '나무를 심는 중');
  const veg = buildVegetation(quality);
  scene.add(veg);
  await tick();

  onProgress(0.85, '풀과 꽃을 키우는 중');
  const grass = buildGrass(detailTex, quality);
  scene.add(grass);
  const falls = buildWaterfalls();
  scene.add(falls);
  const dust = buildDust(quality === 'low' ? 140 : 260);
  scene.add(dust);
  await tick();

  onProgress(1, '준비 완료');
  console.info(`[world] built in ${Math.round(performance.now() - t0)}ms`, JSON.stringify(veg.userData.counts), JSON.stringify(terrain.userData.stats));

  return {
    heightAt,
    floors,
    sun: atmo.sun,
    sky: atmo.sky,
    pointMaterials: [dust.userData.mat, falls.userData.mistMat],
    update(time, camPos) {
      grass.userData.update(camPos);
      dust.userData.update(camPos);
      structures.userData.update(time);
      atmo.sky.position.copy(camPos);
      followShadow(atmo.sun, camPos);
    },
  };
}
