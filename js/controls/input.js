// 입력 모으기: 폰(왼쪽 조이스틱 + 오른쪽 밀어서 둘러보기), 컴퓨터(WASD + 마우스)
export class Input {
  constructor(root, joyEl, knobEl) {
    this.root = root;
    this.joyEl = joyEl;
    this.knobEl = knobEl;
    this.move = { x: 0, y: 0 };   // 조이스틱 (-1~1), y>0 = 앞으로
    this.look = { dx: 0, dy: 0 }; // 이번 프레임에 쌓인 시선 이동량 (픽셀)
    this.keys = new Set();
    this.enabled = false;
    this.joyId = null;
    this.lookId = null;
    this.joyCenter = { x: 0, y: 0 };
    this.joyRadius = 52;
    this.lastLook = { x: 0, y: 0 };

    root.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (this.enabled && document.pointerLockElement === root) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    // 컴퓨터: 화면을 클릭하면 마우스로 둘러보기 (Esc로 해제)
    root.addEventListener('click', (e) => {
      if (this.enabled && e.pointerType !== 'touch' && !this.isTouch && root.requestPointerLock) {
        try { const p = root.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* 무시 */ }
      }
    });
    this.isTouch = false;
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this.move.x = this.move.y = 0;
      this.joyId = this.lookId = null;
      this.keys.clear();
      this.resetKnob();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  onDown(e) {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') this.isTouch = true;
    const w = window.innerWidth, h = window.innerHeight;
    const leftZone = e.clientX < w * 0.45 && e.clientY > h * 0.35;
    if (e.pointerType === 'touch' && leftZone && this.joyId === null) {
      this.joyId = e.pointerId;
      // 손가락이 닿은 곳으로 조이스틱이 옮겨 온다
      this.joyCenter.x = e.clientX; this.joyCenter.y = e.clientY;
      this.joyEl.classList.add('active');
      this.joyEl.style.left = `${e.clientX}px`;
      this.joyEl.style.top = `${e.clientY}px`;
      this.updateJoy(e.clientX, e.clientY);
    } else if (this.lookId === null && (e.pointerType === 'touch' || document.pointerLockElement !== this.root)) {
      this.lookId = e.pointerId;
      this.lastLook.x = e.clientX; this.lastLook.y = e.clientY;
    }
  }

  onMove(e) {
    if (!this.enabled) return;
    if (e.pointerId === this.joyId) {
      this.updateJoy(e.clientX, e.clientY);
      e.preventDefault();
    } else if (e.pointerId === this.lookId) {
      const k = e.pointerType === 'touch' ? 1 : 0.8;
      this.look.dx += (e.clientX - this.lastLook.x) * k;
      this.look.dy += (e.clientY - this.lastLook.y) * k;
      this.lastLook.x = e.clientX; this.lastLook.y = e.clientY;
      e.preventDefault();
    }
  }

  onUp(e) {
    if (e.pointerId === this.joyId) {
      this.joyId = null;
      this.move.x = this.move.y = 0;
      this.resetKnob();
    }
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  updateJoy(x, y) {
    let dx = x - this.joyCenter.x, dy = y - this.joyCenter.y;
    const len = Math.hypot(dx, dy), R = this.joyRadius;
    if (len > R) { dx *= R / len; dy *= R / len; }
    this.knobEl.style.transform = `translate(${dx}px, ${dy}px)`;
    // 가운데 작은 범위는 무시 (손 떨림 방지)
    const m = Math.min(len, R) / R;
    const dead = 0.12;
    const mag = m < dead ? 0 : (m - dead) / (1 - dead);
    const a = Math.atan2(dy, dx);
    this.move.x = Math.cos(a) * mag;
    this.move.y = -Math.sin(a) * mag;
  }

  resetKnob() {
    this.knobEl.style.transform = 'translate(0px, 0px)';
    this.joyEl.classList.remove('active');
    this.joyEl.style.left = '';
    this.joyEl.style.top = '';
  }

  // 키보드 + 조이스틱을 합친 이동 방향
  getMove() {
    let x = this.move.x, y = this.move.y;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y, run: k.has('ShiftLeft') || k.has('ShiftRight') };
  }

  consumeLook() {
    const l = { dx: this.look.dx, dy: this.look.dy };
    this.look.dx = this.look.dy = 0;
    return l;
  }
}
