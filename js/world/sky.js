// 하늘, 햇빛, 안개 — 이른 여름 아침
import * as THREE from '../vendor/three.module.min.js';
import { shared, NOISE_GLSL } from './shaderBits.js';

// 해의 방향 (동남쪽 낮은 아침 하늘 — 건너편 절벽을 환하게 비춤)
export const SUN_DIR = new THREE.Vector3(0.62, 0.4, 0.68).normalize();

export const PALETTE = {
  fog: new THREE.Color('#cfdde3'),
  horizon: new THREE.Color('#f3e3cc'),
  zenith: new THREE.Color('#6f9fd0'),
  sun: new THREE.Color('#fff1d6'),
};

export function setupAtmosphere(scene) {
  scene.fog = new THREE.FogExp2(PALETTE.fog, 0.00042);
  scene.background = PALETTE.fog.clone();

  const hemi = new THREE.HemisphereLight(new THREE.Color('#d6e6f2'), new THREE.Color('#7d8a5a'), 1.7);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(new THREE.Color('#ffe7c4'), 2.2);
  sun.position.copy(SUN_DIR).multiplyScalar(200);
  sun.castShadow = true;
  const sc = sun.shadow.camera;
  sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48;
  sc.near = 1; sc.far = 420;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  const sky = buildSky();
  scene.add(sky);
  return { sun, hemi, sky };
}

// 그림자 범위를 플레이어 주변으로 따라다니게 (흔들림 방지를 위해 칸에 맞춰 이동)
const _tmp = new THREE.Vector3();
export function followShadow(sun, focus) {
  const cam = sun.shadow.camera;
  const texel = (cam.right - cam.left) / sun.shadow.mapSize.x;
  // 빛 방향 기준 좌표계에서 칸에 맞춤
  _tmp.copy(focus);
  const snap = (v) => Math.round(v / texel) * texel;
  _tmp.x = snap(_tmp.x); _tmp.z = snap(_tmp.z); _tmp.y = snap(_tmp.y);
  sun.target.position.copy(_tmp);
  sun.position.copy(_tmp).addScaledVector(SUN_DIR, 200);
  sun.target.updateMatrixWorld();
}

function buildSky() {
  const geo = new THREE.SphereGeometry(5000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: shared.uTime,
      uSunDir: { value: SUN_DIR },
      uHorizon: { value: PALETTE.horizon },
      uZenith: { value: PALETTE.zenith },
      uFog: { value: PALETTE.fog },
      uSun: { value: PALETTE.sun },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir, uHorizon, uZenith, uFog, uSun;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        vec3 col = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.75, y), 0.55));
        // 지평선 근처는 안개 색과 자연스럽게 이어지게
        col = mix(col, uFog, smoothstep(0.12, -0.02, y));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSun * (pow(s, 900.0) * 18.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.18);
        // 몽실몽실 구름
        if (y > 0.02) {
          vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = cNoise(uv) * 0.55 + cNoise(uv * 2.4 + 1.7) * 0.3 + cNoise(uv * 5.3 + 4.1) * 0.15;
          float c = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.18, y);
          vec3 cloudCol = mix(vec3(1.0, 0.97, 0.93), vec3(0.86, 0.88, 0.92), smoothstep(0.62, 0.9, n));
          cloudCol += uSun * pow(s, 8.0) * 0.4;
          col = mix(col, cloudCol, c * 0.85);
        }
        gl_FragColor = vec4(min(col, vec3(1.0)), 1.0);
        // 톤매핑을 하지 않아야 안개 색과 하늘 아래쪽이 딱 맞는다
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.name = 'sky';
  return mesh;
}
