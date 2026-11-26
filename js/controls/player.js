// 플레이어 (1인칭 여행자): 걷기, 둘러보기, 땅 높이 따라가기, 물·절벽·물체 막기, 걸음 흔들림
import * as THREE from '../vendor/three.module.min.js';
import { WALK_AREA, WATER_LEVEL } from '../world/layout.js';
import { blocked } from '../world/colliders.js';

const EYE = 1.62;          // 눈높이 (m)
const WALK = 1.75;         // 걷는 속도 (m/s) — 느긋하게
const RUN = 3.2;           // Shift (컴퓨터)
const RADIUS = 0.35;       // 몸 두께
const MAX_CLIMB = 0.62;    // 이보다 가파른 오르막은 못 오름 (높이/거리)
const LOOK_SPEED = 0.0042; // 화면 밀기 감도

export class Player {
  constructor(camera, world, input) {
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.pos = new THREE.Vector3();
    this.yaw = 0;   // 0 = 북쪽(-z)
    this.pitch = 0;
    this.vel = new THREE.Vector2();
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.smoothY = 0;
    camera.rotation.order = 'YXZ';
  }

  spawn(x, z, yaw, pitch = -0.04) {
    this.pos.set(x, this.groundAt(x, z), z);
    this.smoothY = this.pos.y;
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0);
    this.apply(0);
  }

  // 그 자리의 바닥 높이 (선착장 위면 판자 높이)
  groundAt(x, z) {
    let h = this.world.heightAt(x, z);
    for (const f of this.world.floors) {
      const dx = x - f.x, dz = z - f.z;
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) < f.hx && Math.abs(lz) < f.hz) h = Math.max(h, f.y);
    }
    return h;
  }

  canStand(x, z, fromH, step) {
    // 걷는 구역(타원) 밖으로는 못 나감
    const ex = (x - WALK_AREA.cx) / WALK_AREA.rx, ez = (z - WALK_AREA.cz) / WALK_AREA.rz;
    if (ex * ex + ez * ez > 1) return false;
    const h = this.groundAt(x, z);
    // 물에 빠지지 않게 (물가 자갈까지만)
    if (h < WATER_LEVEL + 0.32) return false;
    // 너무 가파른 오르막은 못 오름 (선착장 같은 낮은 턱은 올라설 수 있음)
    const climb = h - fromH;
    if (climb > 0.3) return false;
    const onFloor = h > this.world.heightAt(x, z) + 0.01;
    if (!onFloor && step > 0 && climb / step > MAX_CLIMB) return false;
    if (blocked(x, z, RADIUS)) return false;
    return true;
  }

  update(dt) {
    const look = this.input.consumeLook();
    this.yaw -= look.dx * LOOK_SPEED;
    this.pitch -= look.dy * LOOK_SPEED;
    this.pitch = Math.max(-1.25, Math.min(1.2, this.pitch));

    const mv = this.input.getMove();
    const speed = mv.run ? RUN : WALK;
    // 앞/옆 방향
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const fx = -sin, fz = -cos;      // 앞
    const rx = cos, rz = -sin;       // 오른쪽
    const tx = (fx * mv.y + rx * mv.x) * speed;
    const tz = (fz * mv.y + rz * mv.x) * speed;
    // 부드럽게 출발·정지
    const k = 1 - Math.exp(-dt * 6);
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.y += (tz - this.vel.y) * k;

    const dx = this.vel.x * dt, dz = this.vel.y * dt;
    const step = Math.hypot(dx, dz);
    let moved = 0;
    if (step > 1e-5) {
      const h0 = this.groundAt(this.pos.x, this.pos.z);
      // 막히면 방향을 조금씩 틀어서 나무·바위·물가를 따라 미끄러지듯 돌아간다
      const tries = [0, 0.5, -0.5, 1.0, -1.0, 1.4, -1.4];
      for (const a of tries) {
        const c = Math.cos(a), s = Math.sin(a);
        const k2 = Math.cos(a); // 많이 틀수록 느리게
        const mx = (dx * c - dz * s) * k2, mz = (dx * s + dz * c) * k2;
        const st = Math.hypot(mx, mz);
        if (this.canStand(this.pos.x + mx, this.pos.z + mz, h0, st)) {
          this.pos.x += mx; this.pos.z += mz; moved = st;
          if (a !== 0) { this.vel.x = mx / dt; this.vel.y = mz / dt; }
          break;
        }
      }
      if (!moved) this.vel.multiplyScalar(0.3);
    }

    const ground = this.groundAt(this.pos.x, this.pos.z);
    // 언덕에서 높이가 툭툭 튀지 않게 살짝 부드럽게
    this.smoothY += (ground - this.smoothY) * (1 - Math.exp(-dt * 12));
    this.pos.y = this.smoothY;

    // 걸음 흔들림: 걸은 거리만큼 위상이 진행
    const spd = dt > 0 ? moved / dt : 0;
    this.bobAmt += ((spd > 0.2 ? Math.min(spd / WALK, 1.4) : 0) - this.bobAmt) * (1 - Math.exp(-dt * 5));
    this.bobPhase += moved / 0.72 * Math.PI; // 걸음 하나 ≈ 0.72m
    this.apply(dt);
  }

  apply() {
    const b = this.bobAmt;
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.045 * b - 0.02 * b;
    const bobX = Math.sin(this.bobPhase) * 0.018 * b;
    const roll = Math.sin(this.bobPhase) * 0.006 * b;
    const c = this.camera;
    c.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX,
      this.pos.y + EYE + bobY,
      this.pos.z - Math.sin(this.yaw) * bobX
    );
    c.rotation.set(this.pitch + Math.sin(this.bobPhase * 2) * 0.004 * b, this.yaw, roll);
  }
}
