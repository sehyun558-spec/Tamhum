// 절벽을 타고 내려오는 가느다란 폭포 + 아래쪽 물보라
import * as THREE from '../vendor/three.module.min.js';
import { shared, NOISE_GLSL } from './shaderBits.js';
import { heightAt } from './terrain.js';
import { farShoreX, WATERFALLS } from './layout.js';

function ribbon(z0, width) {
  // 건너편 절벽 꼭대기 근처에서 물가까지 경사면을 따라 내려온다
  const fs = farShoreX(z0);
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = fs - 150 + t * 151;
    const y = heightAt(x, z0);
    pts.push(new THREE.Vector3(x, y, z0));
  }
  // 표면에서 살짝 띄우기 (경사면 법선 방향)
  const pos = [], uv = [], idx = [];
  let len = 0;
  for (let i = 0; i <= steps; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(steps, i + 1)];
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const nrm = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
    if (nrm.x < 0) nrm.negate();
    const q = p.clone().addScaledVector(nrm, 1.6);
    if (i > 0) len += q.distanceTo(new THREE.Vector3(pos[pos.length - 3] - 0, pos[pos.length - 2], z0));
    const t = i / steps;
    const w = width * (0.55 + 0.6 * t); // 아래로 갈수록 퍼짐
    pos.push(q.x, q.y, z0 - w / 2, q.x, q.y, z0 + w / 2);
    uv.push(0, len, 1, len);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return { geo: g, bottom: pts[steps].clone(), length: len };
}

export function buildWaterfalls() {
  const group = new THREE.Group();
  group.name = 'waterfalls';
  const fallMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec2 vUv;
      ${NOISE_GLSL}
      void main(){
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float flow = vUv.y * 0.06 - uTime * 0.9;
        float streak = cNoise(vec2(vUv.x * 9.0, flow * 3.0)) * 0.6 + cNoise(vec2(vUv.x * 23.0, flow * 7.0)) * 0.4;
        float a = edge * (0.35 + 0.65 * smoothstep(0.3, 0.8, streak));
        vec3 col = mix(vec3(0.78, 0.86, 0.88), vec3(1.0), streak);
        gl_FragColor = vec4(col, a * 0.85);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  fallMat.uniforms.uTime = shared.uTime;

  const mistPositions = [];
  for (const wf of WATERFALLS) {
    if (wf.side !== 'far') continue;
    const { geo, bottom } = ribbon(wf.z, 5);
    const m = new THREE.Mesh(geo, fallMat);
    m.renderOrder = 2;
    group.add(m);
    for (let i = 0; i < 26; i++) {
      mistPositions.push(bottom.x + 3 + (Math.random() - 0.3) * 8, 1 + Math.random() * 7, bottom.z + (Math.random() - 0.5) * 12, Math.random());
    }
  }

  // 물보라 (부드러운 점들)
  const mg = new THREE.BufferGeometry();
  const mp = [], ms = [];
  for (let i = 0; i < mistPositions.length; i += 4) {
    mp.push(mistPositions[i], mistPositions[i + 1], mistPositions[i + 2]);
    ms.push(mistPositions[i + 3]);
  }
  mg.setAttribute('position', new THREE.Float32BufferAttribute(mp, 3));
  mg.setAttribute('aSeed', new THREE.Float32BufferAttribute(ms, 1));
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: shared.uTime, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA;
      void main(){
        vec3 p = position;
        float t = fract(uTime * 0.08 + aSeed);
        p.y += t * 10.0; p.x += t * 4.0;
        vA = sin(t * 3.14159) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (8.0 + aSeed * 10.0) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(0.93, 0.95, 0.97), a);
        #include <colorspace_fragment>
      }`,
  });
  const mist = new THREE.Points(mg, mistMat);
  mist.frustumCulled = false;
  group.add(mist);
  group.userData.mistMat = mistMat;
  return group;
}
