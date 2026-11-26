// 피오르 물: 잔잔한 청록색, 햇빛 반짝임, 물가는 얕고 맑게
import * as THREE from '../vendor/three.module.min.js';
import { shared, NOISE_GLSL } from './shaderBits.js';
import { SUN_DIR, PALETTE } from './sky.js';
import { DETAIL, WATER_LEVEL } from './layout.js';

export function buildWater(detailTex) {
  const geo = new THREE.PlaneGeometry(7000, 7000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uDetailMin: { value: new THREE.Vector2(DETAIL.minX, DETAIL.minZ) },
    uDetailSize: { value: DETAIL.size },
    uSunDir: { value: SUN_DIR },
    uSun: { value: PALETTE.sun },
    uHorizon: { value: PALETTE.horizon },
    uZenith: { value: PALETTE.zenith },
  }]);
  uniforms.uTime = shared.uTime;
  uniforms.uDetail = { value: detailTex };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    transparent: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform sampler2D uDetail;
      uniform vec2 uDetailMin;
      uniform float uDetailSize;
      uniform vec3 uSunDir, uSun, uHorizon, uZenith;
      varying vec3 vWorld;
      ${NOISE_GLSL}

      // 잔물결: 여러 방향의 사인파를 더해 표면 기울기를 만든다
      vec2 waveSlope(vec2 p, float t){
        vec2 s = vec2(0.0);
        vec2 d1 = normalize(vec2(0.8, 0.6));  float k1 = 0.55;
        vec2 d2 = normalize(vec2(-0.3, 1.0)); float k2 = 0.9;
        vec2 d3 = normalize(vec2(1.0, -0.4)); float k3 = 1.7;
        vec2 d4 = normalize(vec2(-0.7, -0.7));float k4 = 2.9;
        s += d1 * cos(dot(p, d1) * k1 + t * 0.9) * 0.040;
        s += d2 * cos(dot(p, d2) * k2 + t * 1.3) * 0.030;
        s += d3 * cos(dot(p, d3) * k3 + t * 1.8) * 0.022;
        s += d4 * cos(dot(p, d4) * k4 + t * 2.4) * 0.016;
        // 잔잔한 무늬
        float n1 = cNoise(p * 0.35 + vec2(t * 0.15, t * 0.05));
        float n2 = cNoise(p * 0.35 + vec2(0.37, 0.0) + vec2(t * 0.15, t * 0.05));
        float n3 = cNoise(p * 0.35 + vec2(0.0, 0.37) + vec2(t * 0.15, t * 0.05));
        s += vec2(n2 - n1, n3 - n1) * 0.35;
        return s;
      }

      void main(){
        vec3 V = cameraPosition - vWorld;
        float dist = length(V);
        V /= dist;
        // 멀리 갈수록 물결을 잦아들게 (반짝임 깜빡임 방지)
        float calm = 1.0 / (1.0 + dist * 0.006);
        vec2 sl = waveSlope(vWorld.xz, uTime) * calm;
        vec3 N = normalize(vec3(-sl.x, 1.0, -sl.y));

        // 얕은 곳 / 깊은 곳
        vec2 tuv = (vWorld.xz - uDetailMin) / uDetailSize;
        float ground = -40.0;
        if (tuv.x > 0.0 && tuv.y > 0.0 && tuv.x < 1.0 && tuv.y < 1.0) ground = texture2D(uDetail, tuv).r;
        float depth = max(${WATER_LEVEL.toFixed(1)} - ground, 0.0);
        float shallow = exp(-depth * 0.45);

        vec3 deep = vec3(0.015, 0.11, 0.115);
        vec3 mid = vec3(0.04, 0.26, 0.24);
        vec3 shal = vec3(0.30, 0.42, 0.33);
        vec3 body = mix(deep, mid, exp(-depth * 0.06));
        body = mix(body, shal, shallow * 0.6);
        // 햇빛이 물속으로 스며드는 느낌
        body *= 0.75 + 0.35 * max(dot(N, uSunDir), 0.0);

        // 반사: 위쪽은 하늘, 수평선 근처는 절벽의 초록이 비친 듯
        vec3 R = reflect(-V, N);
        float ry = max(R.y, 0.0);
        vec3 skyCol = mix(uHorizon, uZenith, pow(smoothstep(0.0, 0.75, ry), 0.55));
        // 반사된 시선이 어느 절벽에 먼저 닿는지 대략 계산해서 그 절벽의 초록을 비춘다
        vec2 rh = normalize(R.xz + vec2(1e-4));
        float tanE = R.y / max(length(R.xz), 1e-3);
        float dFar  = rh.x < 0.0 ? (vWorld.x + 600.0) / -rh.x : 1e6;
        float dNear = rh.x > 0.0 ? (260.0 - vWorld.x) / rh.x : 1e6;
        float dEnd  = rh.y < 0.0 ? (vWorld.z + 1750.0) / -rh.y : (1750.0 - vWorld.z) / rh.y;
        float dW = dFar; float hW = 360.0;
        if (dNear < dW) { dW = dNear; hW = 250.0; }
        if (dEnd < dW)  { dW = dEnd;  hW = 650.0; }
        dW = max(dW, 30.0);
        float ridgeTan = hW / dW * (0.85 + 0.3 * cNoise(vec2(atan(rh.y, rh.x) * 30.0, hW)));
        float cover = smoothstep(ridgeTan * 1.04, ridgeTan * 0.9, tanE);
        vec3 cliffRefl = mix(vec3(0.05, 0.11, 0.06), vec3(0.09, 0.13, 0.1), cNoise(rh * 40.0));
        cliffRefl = mix(cliffRefl, uHorizon * 0.7, 1.0 - exp(-dW * 0.00028));
        vec3 refl = mix(skyCol, cliffRefl, cover);
        refl += uSun * pow(max(dot(R, uSunDir), 0.0), 18.0) * 0.25;

        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        vec3 col = mix(body, refl, clamp(fres, 0.0, 1.0));

        // 햇빛 반짝임
        float spec = pow(max(dot(R, uSunDir), 0.0), 420.0);
        float spark = smoothstep(0.82, 1.0, cNoise(vWorld.xz * 2.5 + uTime * vec2(0.6, -0.4)));
        col += uSun * (spec * 7.0 + spec * spark * 30.0 + pow(max(dot(R, uSunDir), 0.0), 60.0) * spark * 1.5) * calm;

        // 물가 거품 띠
        float foamLine = smoothstep(0.35, 0.0, depth) * (0.55 + 0.45 * sin(uTime * 1.3 + vWorld.z * 0.4 + cNoise(vWorld.xz * 0.8) * 6.0));
        col = mix(col, vec3(0.92, 0.95, 0.95), foamLine * 0.35 * step(-39.0, ground));

        float alpha = mix(0.97, 0.5, shallow);
        alpha = max(alpha, fres);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  mesh.renderOrder = 1;
  mesh.name = 'water';
  return mesh;
}
