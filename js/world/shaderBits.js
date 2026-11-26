// 여러 재질이 함께 쓰는 셰이더 조각: 시간, 바람, 구름 그림자
import * as THREE from '../vendor/three.module.min.js';

// 모든 재질이 공유하는 값 (매 프레임 main.js에서 시간만 갱신)
export const shared = {
  uTime: { value: 0 },
};

export const NOISE_GLSL = /* glsl */ `
float cHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float cNoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x),
             mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

export const CLOUD_GLSL = /* glsl */ `
float cloudShadow(vec2 p){
  vec2 q = p * 0.0045 + vec2(uTime * 0.018, uTime * 0.007);
  float n = cNoise(q) * 0.62 + cNoise(q * 2.3 + 3.1) * 0.28 + cNoise(q * 5.7 + 7.7) * 0.10;
  return mix(1.0, 0.68, smoothstep(0.58, 0.74, n));
}
`;

/**
 * MeshLambertMaterial 등에 바람 흔들림·구름 그림자를 덧붙인다.
 * opts.cloud: 구름 그림자, opts.wind: 줄기 흔들림 세기, opts.flutter: 잎 떨림 세기
 */
export function patchMaterial(mat, opts = {}) {
  const { cloud = false, wind = 0, flutter = 0 } = opts;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = shared.uTime;
    const head = `uniform float uTime;\nvarying vec2 vWPos;\n` + NOISE_GLSL;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + head);

    if (wind > 0 || flutter > 0) {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
          ip = instanceMatrix[3].xyz;
        #endif
        float ph = ip.x * 0.21 + ip.z * 0.17;
        float hh = max(position.y, 0.0);
        float gust = 0.65 + 0.35 * sin(uTime * 0.37 + ip.x * 0.01);
        float sw = (sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 1.93 + ph * 1.3) * 0.3) * gust;
        transformed.x += sw * ${wind.toFixed(5)} * hh * hh;
        transformed.z += sw * ${(wind * 0.5).toFixed(5)} * hh * hh;
        transformed += objectNormal * sin(uTime * 6.0 + position.y * 3.0 + position.x * 4.0 + ph * 5.0) * ${flutter.toFixed(5)} * hh;
        `
      );
    }
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 cwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        cwp = instanceMatrix * cwp;
      #endif
      vWPos = (modelMatrix * cwp).xz;
      `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\n' + head + (cloud ? CLOUD_GLSL : '')
    );
    if (cloud) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        'gl_FragColor.rgb *= cloudShadow(vWPos);\n#include <fog_fragment>'
      );
    }
  };
  mat.customProgramCacheKey = () => `p-${cloud}-${wind}-${flutter}`;
  return mat;
}

// 여러 지오메트리를 하나로 합치기 (색을 정점마다 넣어 둔 것들)
export function mergeColored(parts) {
  let count = 0;
  const geos = parts.map(({ geo, color, matrix, colorFn }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (colorFn) colorFn(tmp, g.attributes.position, i, g);
      else tmp.copy(color);
      c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    count += n;
    return g;
  });
  const pos = new Float32Array(count * 3), nor = new Float32Array(count * 3), col = new Float32Array(count * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o);
    nor.set(g.attributes.normal.array, o);
    col.set(g.attributes.color.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// 정점을 살짝 흐트러뜨려 손으로 깎은 듯한 느낌 주기 (같은 위치 정점은 같이 움직임)
export function jitter(geo, amount, rand) {
  const p = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let off = map.get(key);
    if (!off) { off = [(rand() - 0.5) * amount, (rand() - 0.5) * amount, (rand() - 0.5) * amount]; map.set(key, off); }
    p.setXYZ(i, p.getX(i) + off[0], p.getY(i) + off[1], p.getZ(i) + off[2]);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}
