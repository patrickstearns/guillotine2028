export type SfxId = 'deal' | 'click' | 'slice';
export type SoundMode = 'muted' | 'sfx' | 'all';
export type BgmContext = 'title' | 'ambient' | 'myTurn';

const FILES: Record<SfxId, string> = {
  deal: '/assets/sfx/oxidvideos-taking-playing-card-522520.mp3',
  click: '/assets/sfx/universfield-mouse-click-117076.mp3',
  slice: '/assets/sfx/floraphonic-metal-blade-slice-80-200898.mp3',
};

const BGM_FILE = '/assets/sfx/joshuahudesmusic-zapatista-garage-punk-instrumental-instrumental-201262.mp3';
const BGM_VOL: Record<BgmContext, number> = {
  title: 0.25,
  ambient: 0.3,
  myTurn: 0.5,
};
const BGM_FADE_MS = 700;

const STORAGE_KEY = 'g2028-sound-mode';
const VOL = 0.55;
const pools = new Map<SfxId, HTMLAudioElement[]>();
let unlocked = false;
let mode: SoundMode = loadMode();
let bgmContext: BgmContext = 'title';
let bgm: HTMLAudioElement | null = null;
let onModeChange: ((m: SoundMode) => void) | null = null;
let fadeRaf = 0;

function loadMode(): SoundMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'muted' || v === 'sfx' || v === 'all') return v;
  } catch {
    /* ignore */
  }
  return 'all';
}

function saveMode(): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

function ensurePool(id: SfxId): HTMLAudioElement[] {
  let pool = pools.get(id);
  if (!pool) {
    pool = [0, 1, 2].map(() => {
      const a = new Audio(FILES[id]);
      a.preload = 'auto';
      a.volume = VOL;
      return a;
    });
    pools.set(id, pool);
  }
  return pool;
}

function ensureBgm(): HTMLAudioElement {
  if (!bgm) {
    bgm = new Audio(BGM_FILE);
    bgm.loop = true;
    bgm.preload = 'auto';
    bgm.volume = 0;
  }
  return bgm;
}

function cancelFade(): void {
  if (fadeRaf) {
    cancelAnimationFrame(fadeRaf);
    fadeRaf = 0;
  }
}

function fadeBgmTo(target: number, onDone?: () => void): void {
  const a = ensureBgm();
  cancelFade();
  const from = a.volume;
  if (Math.abs(from - target) < 0.001) {
    a.volume = target;
    onDone?.();
    return;
  }
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / BGM_FADE_MS);
    // ease in-out
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    a.volume = from + (target - from) * e;
    if (t < 1) {
      fadeRaf = requestAnimationFrame(tick);
    } else {
      fadeRaf = 0;
      a.volume = target;
      onDone?.();
    }
  };
  fadeRaf = requestAnimationFrame(tick);
}

function applyBgm(): void {
  const a = ensureBgm();
  if (mode !== 'all') {
    fadeBgmTo(0, () => {
      if (mode !== 'all') a.pause();
    });
    return;
  }
  const target = BGM_VOL[bgmContext];
  if (unlocked) {
    if (a.paused) {
      a.volume = 0;
      void a.play().catch(() => {});
    }
    fadeBgmTo(target);
  } else {
    a.volume = target;
  }
}

export function getSoundMode(): SoundMode {
  return mode;
}

export function soundModeLabel(m: SoundMode = mode): string {
  if (m === 'muted') return 'Muted';
  if (m === 'sfx') return 'SFX Only';
  return 'Sound';
}

export function cycleSoundMode(): SoundMode {
  mode = mode === 'muted' ? 'sfx' : mode === 'sfx' ? 'all' : 'muted';
  saveMode();
  applyBgm();
  onModeChange?.(mode);
  return mode;
}

export function onSoundModeChange(cb: (m: SoundMode) => void): void {
  onModeChange = cb;
}

export function setBgmContext(ctx: BgmContext): void {
  if (bgmContext === ctx) return;
  bgmContext = ctx;
  applyBgm();
}

export function unlockSfx(): void {
  if (unlocked) return;
  unlocked = true;
  (Object.keys(FILES) as SfxId[]).forEach((id) => {
    ensurePool(id).forEach((a) => {
      void a.play().then(() => {
        a.pause();
        a.currentTime = 0;
      }).catch(() => {});
    });
  });
  applyBgm();
}

export function playSfx(id: SfxId): void {
  if (mode === 'muted') return;
  const pool = ensurePool(id);
  const a = pool.find((x) => x.paused || x.ended) ?? pool[0]!;
  try {
    a.currentTime = 0;
    a.volume = VOL;
    void a.play().catch(() => {});
  } catch {
    /* ignore */
  }
}

const INTERACTIVE =
  'button, a, input, select, textarea, label, [role="button"], .card.playable, .card.selectable, .action-slot';

export function installClickSfx(root: ParentNode): void {
  root.addEventListener(
    'pointerdown',
    (e) => {
      const t = e.target as Element | null;
      if (!t?.closest) return;
      if (t.closest('#sound-mode-btn')) return;
      const hit = t.closest(INTERACTIVE);
      if (!hit) return;
      if (hit instanceof HTMLInputElement && (hit.type === 'checkbox' || hit.type === 'radio')) {
        playSfx('click');
        return;
      }
      if (hit instanceof HTMLButtonElement && hit.disabled) return;
      playSfx('click');
    },
    true,
  );
}
