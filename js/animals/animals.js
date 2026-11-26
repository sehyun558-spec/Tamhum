// 동물 (다음 단계에서 채울 자리)
// 지금은 등장 지점만 준비되어 있다. 주소 끝에 ?spots 를 붙이면 지점이 노란 기둥으로 보인다.
import * as THREE from '../vendor/three.module.min.js';
import { ANIMAL_SPOTS } from './spawnPoints.js';

export function initAnimals(scene, world) {
  // 각 지점의 실제 높이 계산
  const spots = ANIMAL_SPOTS.map((s) => ({ ...s, y: world.heightAt(s.x, s.z) }));

  if (new URLSearchParams(location.search).has('spots')) {
    const geo = new THREE.CylinderGeometry(0.25, 0.25, 6, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    for (const s of spots) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(s.x, s.y + 3, s.z);
      scene.add(m);
    }
  }

  // TODO(2단계): GLTFLoader로 GLB 모델을 불러와 spots 위치에 배치하고,
  // 플레이어가 가까이 오면 나타나거나 도망가게 만들기.
  return {
    spots,
    update(/* dt, playerPos */) {},
  };
}
