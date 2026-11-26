// 게임 시작점: 화면(렌더러) 준비 → 세상 만들기 → 매 프레임 그리기
import * as THREE from './vendor/three.module.min.js';
import { buildWorld } from './world/world.js';
import { shared } from './world/shaderBits.js';
import { Input } from './controls/input.js';
import { Player } from './controls/player.js';
import { Screens } from './ui/screens.js';
import { initAnimals } from './animals/animals.js';

// ---------- 화질 설정 ----------
const QUALITY_KEY = 'northpath.quality';
let quality = 'high';
try { quality = localStorage.getItem(QUALITY_KEY) || guessQuality(); } catch (_) { quality = guessQuality(); }
function guessQuality() {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  return cores <= 4 || mem <= 3 ? 'low' : 'high';
}
const DPR_CAP = () => Math.min(window.devicePixelRatio || 1, quality === 'high' ? 2 : 1.5);

// ---------- 렌더러 ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: (window.devicePixelRatio || 1) < 2,
  powerPreference: 'high-performance',
  stencil: false,
});
let dpr = DPR_CAP();
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 6500);

function fitCamera() {
  const w = window.innerWidth, h = window.innerHeight, a = w / h;
  camera.aspect = a;
  // 세로 화면에서도 옆이 너무 좁아 보이지 않게 시야각 조정
  camera.fov = a < 1 ? THREE.MathUtils.lerp(80, 64, a) : 60;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  updatePointScale();
}
function updatePointScale() {
  if (!world) return;
  const s = (window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  for (const m of world.pointMaterials) m.uniforms.uScale.value = s;
}
window.addEventListener('resize', fitCamera);
window.addEventListener('orientationchange', () => setTimeout(fitCamera, 300));

// ---------- 게임 상태 ----------
let world = null, player = null, animals = null;
let mode = 'loading'; // loading → title → play / paused
const input = new Input(canvas, document.getElementById('joystick'), document.getElementById('joyKnob'));
const START = { x: 40, z: 24, yaw: 0.55 };

const screens = new Screens({
  onStart: () => {
    player.spawn(START.x, START.z, START.yaw);
    renderer.toneMappingExposure = 0.35; // 여기서부터 서서히 밝아짐
    exposureTarget = 1.0;
    mode = 'play';
    input.setEnabled(true);
  },
  onPause: () => { mode = 'paused'; input.setEnabled(false); },
  onResume: () => { mode = 'play'; input.setEnabled(true); },
  onTitle: () => { mode = 'title'; input.setEnabled(false); },
  onQuality: () => {
    quality = quality === 'high' ? 'low' : 'high';
    try { localStorage.setItem(QUALITY_KEY, quality); } catch (_) { /* 무시 */ }
    applyQuality();
  },
});

function applyQuality() {
  screens.setQualityLabel(quality);
  dpr = DPR_CAP();
  renderer.setPixelRatio(dpr);
  fitCamera();
  if (world) {
    const size = quality === 'high' ? 2048 : 1024;
    if (world.sun.shadow.mapSize.x !== size) {
      world.sun.shadow.mapSize.set(size, size);
      if (world.sun.shadow.map) { world.sun.shadow.map.dispose(); world.sun.shadow.map = null; }
    }
  }
}

// ---------- 자동 화질 조절 (느리면 해상도를 조금씩 낮춤) ----------
let perfTime = 0, perfFrames = 0, goodStreak = 0;
function adaptResolution(dt) {
  perfTime += dt; perfFrames++;
  if (perfTime < 2) return;
  const fps = perfFrames / perfTime;
  perfTime = 0; perfFrames = 0;
  const cap = DPR_CAP();
  if (fps < 50 && dpr > 1) {
    dpr = Math.max(1, dpr - 0.25);
    renderer.setPixelRatio(dpr); fitCamera();
    goodStreak = 0;
  } else if (fps > 58.5 && dpr < cap) {
    if (++goodStreak >= 3) {
      dpr = Math.min(cap, dpr + 0.25);
      renderer.setPixelRatio(dpr); fitCamera();
      goodStreak = 0;
    }
  } else goodStreak = 0;
}

// ---------- 시작 화면 카메라 (천천히 둘러보기) ----------
function titleCamera(t) {
  const x = 62, z = 40;
  const y = world.heightAt(x, z) + 7.5;
  camera.position.set(x, y, z);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(-0.06 + Math.sin(t * 0.07) * 0.02, 0.62 + Math.sin(t * 0.045) * 0.22, 0);
}

// ---------- 매 프레임 ----------
const clock = new THREE.Clock();
let exposureTarget = 1.0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  shared.uTime.value += dt;
  const t = shared.uTime.value;

  if (mode === 'play') player.update(dt);
  else if (mode === 'title') titleCamera(t);

  if (world) {
    world.update(t, camera.position);
    animals.update(dt, camera.position);
    renderer.toneMappingExposure += (exposureTarget - renderer.toneMappingExposure) * (1 - Math.exp(-dt * 1.3));
    renderer.render(scene, camera);
    if (mode === 'play') adaptResolution(dt);
  }
  requestAnimationFrame(frame);
}

// ---------- 시작 ----------
async function boot() {
  screens.setQualityLabel(quality);
  fitCamera();
  try {
    world = await buildWorld(scene, quality, (p, label) => screens.setProgress(p, label));
  } catch (err) {
    console.error(err);
    screens.setProgress(0, '세상을 만들지 못했어요. 새로고침해 주세요');
    return;
  }
  animals = initAnimals(scene, world);
  player = new Player(camera, world, input);
  applyQuality();
  mode = 'title';
  titleCamera(0);
  // 무거운 셰이더를 미리 준비해 두기 (첫 화면 끊김 방지)
  renderer.compile(scene, camera);
  requestAnimationFrame(frame);
  setTimeout(() => screens.ready(), 400);

  // 디버그: 주소 끝에 ?play 를 붙이면 시작 화면을 건너뜀
  const q = new URLSearchParams(location.search);
  if (q.has('play')) {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    document.getElementById('fade').style.opacity = '0';
    screens.playing = true;
    screens.cb.onStart();
    renderer.toneMappingExposure = 1;
  }
  window.__game = { scene, camera, renderer, player, world, setMode: (m) => (mode = m) };
}
boot();
