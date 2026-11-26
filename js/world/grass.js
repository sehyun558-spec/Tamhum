// 풀: 플레이어 주변 정사각형 구역에만 그리고, 걸어가면 풀 묶음이 앞쪽으로 "되감겨" 따라온다.
// 땅 높이·풀 밀도는 미리 만든 높이 지도 텍스처에서 셰이더가 직접 읽는다.
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './noise.js';
import { shared, NOISE_GLSL, CLOUD_GLSL } from './shaderBits.js';
import { DETAIL } from './layout.js';

function clumpGeometry(rand) {
  const pos = [], col = [];
  const base = new THREE.Color('#3b6428'), mid = new THREE.Color('#62903f'), tip = new THREE.Color('#a8c268');
  const blades = 4;
  for (let i = 0; i < blades; i++) {
    const a = rand() * Math.PI * 2, r = rand() * 0.22;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const facing = rand() * Math.PI;
    const w = 0.03 + rand() * 0.025, h = 0.26 + rand() * 0.3;
    const fx = Math.cos(facing) * w, fz = Math.sin(facing) * w;
    const lean = (rand() - 0.5) * 0.25;
    // 두 개의 삼각형: 아래 사다리꼴 + 위 뾰족
    const mx = cx + lean * 0.4, mz = cz + lean * 0.2, mh = h * 0.55;
    const tx = cx + lean, tz = cz + lean * 0.5;
    const v = [
      [cx - fx, 0, cz - fz], [cx + fx, 0, cz + fz], [mx + fx * 0.6, mh, mz + fz * 0.6],
      [cx - fx, 0, cz - fz], [mx + fx * 0.6, mh, mz + fz * 0.6], [mx - fx * 0.6, mh, mz - fz * 0.6],
      [mx - fx * 0.6, mh, mz - fz * 0.6], [mx + fx * 0.6, mh, mz + fz * 0.6], [tx, h, tz],
    ];
    for (const p of v) {
      pos.push(p[0], p[1], p[2]);
      const t = p[1] / 0.56;
      const c = t < 0.5 ? base.clone().lerp(mid, t * 2) : mid.clone().lerp(tip, (t - 0.5) * 2);
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function buildGrass(detailTex, quality) {
  const rand = mulberry32(777);
  const W = quality === 'low' ? 40 : 50; // 풀이 그려지는 정사각형 한 변 (m)
  const count = quality === 'low' ? 7000 : 12000;
  const geo = clumpGeometry(rand);
  const off = new Float32Array(count * 2), rnd = new Float32Array(count * 2);
  // 계층적 무작위 배치 (고르게 퍼지게)
  const side = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) {
    const gx = i % side, gz = Math.floor(i / side);
    off[i * 2] = ((gx + rand()) / side) * W;
    off[i * 2 + 1] = ((gz + rand()) / side) * W;
    rnd[i * 2] = rand();
    rnd[i * 2 + 1] = rand();
  }
  geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
  geo.setAttribute('aRnd', new THREE.InstancedBufferAttribute(rnd, 2));
  geo.instanceCount = count;

  const camUniform = { value: new THREE.Vector3() };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    shader.uniforms.uDetail = { value: detailTex };
    shader.uniforms.uDetailMin = { value: new THREE.Vector2(DETAIL.minX, DETAIL.minZ) };
    shader.uniforms.uDetailSize = { value: DETAIL.size };
    shader.uniforms.uCam = camUniform;
    shader.uniforms.uW = { value: W };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform sampler2D uDetail; uniform vec2 uDetailMin; uniform float uDetailSize;
        uniform vec3 uCam; uniform float uW;
        attribute vec2 aOff; attribute vec2 aRnd;
        varying vec2 vWPos;
        ${NOISE_GLSL}`)
      .replace('#include <color_vertex>', `
        vec2 gp = aOff + uW * floor((uCam.xz - aOff) / uW + 0.5);
        vec2 tuv = (gp - uDetailMin) / uDetailSize;
        vec4 det = texture2D(uDetail, tuv);
        float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
        float dens = det.g * inside;
        float dist = distance(gp, uCam.xz);
        float fade = 1.0 - smoothstep(uW * 0.26, uW * 0.48, dist);
        float alive = step(aRnd.x, dens);
        float tallN = cNoise(gp * 0.06 + 3.0);
        float tall = 0.75 + 0.95 * smoothstep(0.5, 0.85, tallN);
        float sc = alive * fade * (0.75 + 0.4 * aRnd.y);
        float ang = aRnd.y * 6.2831 + aRnd.x * 17.0;
        float ca = cos(ang), sa = sin(ang);
        vec3 lp = position;
        lp.y *= tall;
        lp.xz = vec2(ca * lp.x - sa * lp.z, sa * lp.x + ca * lp.z);
        lp *= sc;
        float hh = lp.y;
        float wv = sin(uTime * 1.6 + gp.x * 0.3 + gp.y * 0.22) * 0.5 + sin(uTime * 2.7 + gp.x * 0.8 + gp.y * 0.5) * 0.25;
        float gustWave = smoothstep(0.25, 1.0, sin(dot(gp, vec2(0.085, 0.055)) - uTime * 1.05));
        float bend = (wv * 0.16 + gustWave * 0.32 + 0.1) * hh * hh;
        lp.x += bend; lp.z += bend * 0.55;
        lp.y -= bend * bend * 0.6;
        vec3 gPos = vec3(gp.x, det.r - 0.04, gp.y) + lp;
        vec3 gTint = mix(vec3(0.86, 0.96, 0.78), vec3(1.08, 1.04, 0.82), cNoise(gp * 0.045 + 11.0));
        gTint *= 1.0 + gustWave * 0.18 * position.y;
        #include <color_vertex>
        vColor.rgb *= gTint;
        vWPos = gp;
      `)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; varying vec2 vWPos;
        ${NOISE_GLSL}
        ${CLOUD_GLSL}`)
      // 풀잎 뒷면도 앞면처럼 밝게 (뒤집힌 법선 무시)
      .replace('#include <normal_fragment_begin>', 'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;')
      .replace('#include <fog_fragment>', 'gl_FragColor.rgb *= cloudShadow(vWPos);\n#include <fog_fragment>');
  };
  mat.customProgramCacheKey = () => 'grass-v1';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.name = 'grass';
  // 매 프레임 카메라 위치를 알려 줘야 한다
  mesh.userData.update = (camPos) => camUniform.value.copy(camPos);
  return mesh;
}
