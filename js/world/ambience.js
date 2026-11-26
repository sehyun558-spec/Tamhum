// 공기 중에 떠다니는 빛 먼지 (플레이어 주변에서만, 따라다님)
import * as THREE from '../vendor/three.module.min.js';
import { mulberry32 } from './noise.js';
import { shared } from './shaderBits.js';

export function buildDust(count = 260) {
  const rand = mulberry32(99);
  const B = 26; // 상자 크기 (m)
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = rand() * B; pos[i * 3 + 1] = rand() * 7; pos[i * 3 + 2] = rand() * B;
    seed[i] = rand();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const cam = { value: new THREE.Vector3() };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: shared.uTime, uCam: cam, uB: { value: B }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform vec3 uCam; uniform float uB; uniform float uScale;
      varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.21 + aSeed * 40.0) * 1.5 + uTime * 0.25;
        p.z += cos(uTime * 0.17 + aSeed * 31.0) * 1.5 + uTime * 0.12;
        p.y += sin(uTime * 0.3 + aSeed * 12.0) * 0.6;
        vec3 w;
        w.xz = uCam.xz + mod(p.xz - uCam.xz + uB * 0.5, uB) - uB * 0.5;
        w.y = uCam.y - 2.0 + p.y;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        float dist = -mv.z;
        float tw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 50.0);
        vA = tw * smoothstep(0.5, 2.5, dist) * (1.0 - smoothstep(uB * 0.3, uB * 0.5, dist));
        gl_PointSize = (0.05 + aSeed * 0.05) * uScale / max(dist, 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA * 0.75;
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.7) * a, a);
      }`,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 3;
  pts.name = 'dust';
  pts.userData.update = (camPos) => cam.value.copy(camPos);
  pts.userData.mat = mat;
  return pts;
}
