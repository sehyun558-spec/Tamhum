// 화면 관리: 시작 화면, 햇살 전환, 메뉴, 안내 문구
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Screens {
  constructor({ onStart, onPause, onResume, onTitle, onQuality }) {
    this.el = {
      title: $('title'), start: $('startBtn'), progress: $('progress'), bar: $('progressBar'),
      fade: $('fade'), hud: $('hud'), menu: $('menu'), menuBtn: $('menuBtn'),
      resume: $('resumeBtn'), quality: $('qualityBtn'), full: $('fullBtn'), toTitle: $('titleBtn'), hint: $('hint'),
    };
    this.cb = { onStart, onPause, onResume, onTitle, onQuality };
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!this.isTouch) document.body.classList.add('desktop');

    const tap = (el, fn) => el.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    tap(this.el.start, () => this.start());
    tap(this.el.menuBtn, () => this.openMenu());
    tap(this.el.resume, () => this.closeMenu());
    tap(this.el.quality, () => this.cb.onQuality());
    tap(this.el.full, () => this.toggleFullscreen());
    tap(this.el.toTitle, () => this.backToTitle());
    // 메뉴 바깥을 누르면 닫기
    this.el.menu.addEventListener('click', (e) => { if (e.target === this.el.menu) this.closeMenu(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' || (e.code === 'Escape' && !document.pointerLockElement && this.playing)) {
        this.el.menu.classList.contains('hidden') ? this.openMenu() : this.closeMenu();
      }
    });
    if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) this.el.full.classList.add('hidden');
    this.playing = false;
  }

  setProgress(p, label) {
    this.el.bar.style.width = `${Math.round(p * 100)}%`;
    if (label) this.el.start.textContent = `${label}…`;
  }

  // 세상이 준비되면: 햇살 막을 걷어 내고 시작 버튼 활성화
  ready() {
    this.el.start.disabled = false;
    this.el.start.textContent = '길 떠나기';
    this.el.progress.style.opacity = '0';
    this.el.fade.style.transitionDuration = '2.2s';
    this.el.fade.style.opacity = '0';
  }

  setQualityLabel(q) {
    this.el.quality.textContent = `화질: ${q === 'high' ? '높음' : '가볍게'}`;
  }

  async start() {
    if (this.busy) return;
    this.busy = true;
    // 1) 햇살로 하얗게 덮기
    this.el.fade.style.transitionDuration = '1.1s';
    this.el.fade.style.opacity = '1';
    await wait(1150);
    // 2) 시작 화면 숨기고, 여행자 시점으로 이동
    this.el.title.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.cb.onStart();
    this.playing = true;
    await wait(250);
    // 3) 아침 햇살 속으로 서서히 밝아짐
    this.el.fade.style.transitionDuration = '2.8s';
    this.el.fade.style.opacity = '0';
    await wait(1800);
    this.showHint(this.isTouch ? '왼쪽 아래를 밀어 걷고, 오른쪽을 밀어 둘러보세요' : 'WASD로 걷고, 화면을 클릭하면 마우스로 둘러봐요');
    this.busy = false;
  }

  showHint(text, ms = 5000) {
    const h = this.el.hint;
    h.textContent = text;
    h.classList.add('show');
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => h.classList.remove('show'), ms);
  }

  openMenu() {
    if (!this.playing) return;
    this.el.menu.classList.remove('hidden');
    this.cb.onPause();
  }

  closeMenu() {
    this.el.menu.classList.add('hidden');
    if (this.playing) this.cb.onResume();
  }

  async backToTitle() {
    this.el.menu.classList.add('hidden');
    this.playing = false;
    this.el.fade.style.transitionDuration = '0.9s';
    this.el.fade.style.opacity = '1';
    await wait(950);
    this.el.hud.classList.add('hidden');
    this.el.title.classList.remove('hidden');
    this.cb.onTitle();
    this.el.fade.style.transitionDuration = '1.6s';
    this.el.fade.style.opacity = '0';
  }

  toggleFullscreen() {
    const d = document, el = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) { const p = req.call(el); if (p && p.catch) p.catch(() => {}); }
    }
  }
}
