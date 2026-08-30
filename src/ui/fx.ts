import type { AnimEvent } from '../../shared/types';
import { actionCardHtml, cardBackHtml, nobleCardHtml } from './cards';
import { playSfx } from './sfx';

const FLY_MS = 1200;
const FLIP_MS = 1800;
const COLLECT_STAGGER_MS = 750;
const DEAL_STAGGER_MS = 280;
const DEAL_LEAD_MS = 650;
const RETURN_STAGGER_MS = 95;
const DRAW_CARD_STAGGER_MS = 110;
const DRAW_PLAYER_GAP_MS = 220;
const SLICE_MS = 520;
const SHRINK_MS = 450;

export function snapshotRects(scope: ParentNode): Map<string, DOMRect> {
  const map = new Map<string, DOMRect>();
  scope.querySelectorAll<HTMLElement>('[data-instance]').forEach((el) => {
    const id = el.dataset.instance;
    if (id) map.set(`card:${id}`, el.getBoundingClientRect());
  });
  scope.querySelectorAll<HTMLElement>('.line-slot[data-line-id]').forEach((el) => {
    const id = el.dataset.lineId;
    if (id) map.set(`slot:${id}`, el.getBoundingClientRect());
  });
  scope.querySelectorAll<HTMLElement>('[data-player]').forEach((el) => {
    const id = el.dataset.player;
    const avatar = el.querySelector('.avatar') as HTMLElement | null;
    if (id && avatar) map.set(`player:${id}`, avatar.getBoundingClientRect());
    const pile = el.querySelector('.player-cards') as HTMLElement | null;
    if (id && pile) map.set(`pile:${id}`, pile.getBoundingClientRect());
  });
  for (const id of ['draw-pile', 'discard-pile', 'noble-draw-pile', 'noble-discard-pile']) {
    const el = scope.querySelector(`#${id}`) as HTMLElement | null;
    if (!el) continue;
    map.set(id, el.getBoundingClientRect());
    const card = el.querySelector('.card') as HTMLElement | null;
    if (card) map.set(`${id}-card`, card.getBoundingClientRect());
  }
  const revealCard = scope.querySelector('#play-reveal .card') as HTMLElement | null;
  if (revealCard?.dataset.instance) {
    map.set(`card:${revealCard.dataset.instance}`, revealCard.getBoundingClientRect());
  }
  return map;
}

export function runBoardAnimations(opts: {
  root: HTMLElement;
  prev: Map<string, DOMRect> | null;
  anims: AnimEvent[];
  onCollectLanded?: () => void;
}): void {
  const next = snapshotRects(opts.root);
  const skipFlip = new Set<string>();
  for (const ev of opts.anims) {
    if (ev.type === 'collect_noble' || ev.type === 'deal_noble' || ev.type === 'discard_noble' || ev.type === 'play_front' || ev.type === 'return_to_deck' || ev.type === 'line_walk') {
      skipFlip.add(`card:${ev.instanceId}`);
      if (ev.type === 'line_walk') skipFlip.add(`slot:${ev.instanceId}`);
    }
    if (ev.type === 'discard_action' && ev.instanceId) skipFlip.add(`card:${ev.instanceId}`);
  }
  const lineCollects = opts.anims.filter((ev) => ev.type === 'collect_noble' && !ev.fromDeck);
  const lineHold = lineCollects.length ? (lineCollects.length - 1) * COLLECT_STAGGER_MS + SLICE_MS + 40 : 0;
  const returns = opts.anims.filter((ev) => ev.type === 'return_to_deck');
  const returnHold = returns.length ? (returns.length - 1) * RETURN_STAGGER_MS + FLY_MS + 80 : 0;
  const restoreFront = lineCollects.length ? calmNewFront(opts.root, new Set(lineCollects.map((ev) => ev.instanceId))) : null;
  if (opts.prev && opts.prev.size) {
    flipCards(opts.prev, next, skipFlip, lineHold, restoreFront);
  } else {
    restoreFront?.();
  }

  const layer = ensureFxLayer();
  let collectI = 0;
  let dealI = 0;
  let dumpI = 0;
  let drawDelay = 0;
  let lastDrawPlayer: string | null = null;
  const collectTotal = opts.anims.filter((ev) => ev.type === 'collect_noble').length;
  let collectLeft = collectTotal;
  const collectLanded = () => {
    collectLeft -= 1;
    if (collectLeft <= 0) opts.onCollectLanded?.();
  };
  for (const ev of opts.anims) {
    if (ev.type === 'draw_action') {
      const live = opts.root.querySelector(`[data-instance="${ev.instanceId}"]`) as HTMLElement | null;
      if (live) live.style.opacity = '0';
      if (lastDrawPlayer && lastDrawPlayer !== ev.playerId) drawDelay += DRAW_PLAYER_GAP_MS;
      lastDrawPlayer = ev.playerId;
      const delay = drawDelay;
      drawDelay += DRAW_CARD_STAGGER_MS;
      window.setTimeout(() => playSfx('deal'), delay);
      fly(
        layer,
        cardBackHtml('action'),
        opts.prev?.get('draw-pile-card') ?? opts.prev?.get('draw-pile') ?? next.get('draw-pile-card'),
        next.get(`player:${ev.playerId}`),
        {
          delay,
          onDone: () => {
            if (live) {
              live.style.opacity = '';
              live.classList.remove('await-arrive');
            }
          },
        },
      );
    } else if (ev.type === 'discard_action') {
      const from =
        (ev.instanceId ? opts.prev?.get(`card:${ev.instanceId}`) : undefined) ??
        opts.prev?.get(`player:${ev.playerId}`) ??
        next.get(`player:${ev.playerId}`);
      const html = actionCardHtml({ instanceId: 'fx', defId: ev.defId });
      const destEl = opts.root.querySelector('#discard-pile .card') as HTMLElement | null;
      if (destEl) destEl.style.opacity = '0';
      fly(layer, html || cardBackHtml('action'), from, next.get('discard-pile-card') ?? next.get('discard-pile') ?? opts.prev?.get('discard-pile'), {
        shrinkFirst: true,
        onDone: () => {
          if (destEl) {
            destEl.style.opacity = '';
            destEl.classList.remove('await-arrive');
          }
        },
      });
    } else if (ev.type === 'reveal_action') {
      const line = opts.root.querySelector('#noble-line') as HTMLElement | null;
      if (line) line.scrollTo({ left: 0, behavior: 'smooth' });
      const el = opts.root.querySelector('#play-reveal .card') as HTMLElement | null;
      const from = opts.prev?.get(`card:${ev.instanceId}`);
      if (el && from) {
        const to = el.getBoundingClientRect();
        el.style.fontSize = `${(13 * to.width) / 132}px`;
        const sx = from.width / Math.max(1, to.width);
        const sy = from.height / Math.max(1, to.height);
        el.style.transformOrigin = 'top left';
        el.style.transition = 'none';
        el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.transition = 'transform 0.38s cubic-bezier(.22, .7, .2, 1)';
            el.style.transform = 'translate(0px, 0px) scale(1)';
          });
        });
      }
    } else if (ev.type === 'play_front') {
      const from =
        opts.prev?.get(`card:${ev.instanceId}`) ??
        opts.prev?.get(`player:${ev.playerId}`) ??
        next.get(`player:${ev.playerId}`);
      const to = playerIconRect(opts.root, ev.playerId, next);
      const live = opts.root.querySelector(`[data-instance="${ev.instanceId}"]`) as HTMLElement | null;
      if (live) live.style.opacity = '0';
      const html = actionCardHtml({ instanceId: 'fx', defId: ev.defId });
      fly(layer, html, from, to, {
        shrinkFirst: true,
        onDone: () => {
          if (live) {
            live.style.opacity = '';
            live.classList.remove('await-arrive');
          }
        },
      });
    } else if (ev.type === 'deal_noble') {
      const live = opts.root.querySelector(`[data-instance="${ev.instanceId}"]`) as HTMLElement | null;
      const slot = live?.closest('.line-slot') as HTMLElement | null;
      const html = nobleCardHtml({ instanceId: ev.instanceId, defId: ev.defId });
      if (live) live.style.opacity = '0';
      const delay = lineHold + returnHold + DEAL_LEAD_MS + dealI * DEAL_STAGGER_MS;
      dealI += 1;
      const fromDeck =
        opts.prev?.get('noble-draw-pile-card') ?? opts.prev?.get('noble-draw-pile') ?? next.get('noble-draw-pile-card');
      window.setTimeout(() => {
        playSfx('deal');
        slot?.classList.remove('is-dealing');
        const dest = live ? live.getBoundingClientRect() : undefined;
        fly(layer, html, fromDeck, dest, {
          onDone: () => {
            if (live) live.style.opacity = '';
          },
        });
      }, delay);
    } else if (ev.type === 'return_to_deck') {
      const from = opts.prev?.get(`card:${ev.instanceId}`) ?? opts.prev?.get(`slot:${ev.instanceId}`);
      const html = nobleCardHtml({ instanceId: ev.instanceId, defId: ev.defId });
      const delay = dumpI * RETURN_STAGGER_MS;
      dumpI += 1;
      fly(layer, html, from, next.get('noble-draw-pile-card') ?? next.get('noble-draw-pile'), {
        delay,
        shrinkFirst: true,
      });
    } else if (ev.type === 'discard_noble') {
      const fromPile = ev.playerId
        ? opts.prev?.get(`card:${ev.instanceId}`) ??
          opts.prev?.get(`pile:${ev.playerId}`) ??
          opts.prev?.get(`player:${ev.playerId}`) ??
          next.get(`pile:${ev.playerId}`) ??
          next.get(`player:${ev.playerId}`)
        : opts.prev?.get(`card:${ev.instanceId}`) ?? next.get('noble-draw-pile');
      const html = nobleCardHtml({ instanceId: ev.instanceId, defId: ev.defId });
      const delay = ev.playerId ? 0 : dumpI * DEAL_STAGGER_MS;
      if (!ev.playerId) dumpI += 1;
      const destEl = opts.root.querySelector('#noble-discard-pile .card') as HTMLElement | null;
      if (destEl) destEl.style.opacity = '0';
      fly(layer, html, fromPile, next.get('noble-discard-pile-card') ?? next.get('noble-discard-pile') ?? opts.prev?.get('noble-discard-pile'), {
        delay,
        onDone: () => {
          if (destEl) {
            destEl.style.opacity = '';
            destEl.classList.remove('await-arrive');
          }
        },
      });
    } else if (ev.type === 'collect_noble') {
      const from = ev.fromDeck
        ? opts.prev?.get('noble-draw-pile') ?? next.get('noble-draw-pile')
        : opts.prev?.get(`card:${ev.instanceId}`);
      const to = playerIconRect(opts.root, ev.playerId, next);
      const live = opts.root.querySelector(`[data-instance="${ev.instanceId}"]`) as HTMLElement | null;
      const html = nobleCardHtml(
        { instanceId: ev.instanceId, defId: ev.defId },
        { frightened: !ev.fromDeck },
      ) || (live ? live.outerHTML : cardBackHtml('noble'));
      if (live) live.style.opacity = '0';
      const delay = collectI * COLLECT_STAGGER_MS;
      collectI += 1;
      if (ev.fromDeck) window.setTimeout(() => playSfx('deal'), delay);
      sliceThenFly(layer, html, from, to, delay, () => {
        if (live) {
          live.style.opacity = '';
          live.classList.remove('await-arrive');
        }
        collectLanded();
      });
    } else if (ev.type === 'line_walk') {
      const from = opts.prev?.get(`card:${ev.instanceId}`) ?? opts.prev?.get(`slot:${ev.instanceId}`);
      const to = next.get(`card:${ev.instanceId}`) ?? next.get(`slot:${ev.instanceId}`);
      const live = opts.root.querySelector(`[data-instance="${ev.instanceId}"]`) as HTMLElement | null;
      const html = nobleCardHtml(
        { instanceId: ev.instanceId, defId: ev.defId },
        { frightened: !!ev.fromFront },
      ) || (live ? live.outerHTML : cardBackHtml('noble'));
      if (live) live.style.opacity = '0';
      fly(layer, html, from, to, {
        delay: 80,
        onDone: () => {
          if (live) live.style.opacity = '';
        },
      });
    }
  }
}

function playerIconRect(root: HTMLElement, playerId: string, next: Map<string, DOMRect>): DOMRect | undefined {
  const avatar = root.querySelector(`[data-player="${playerId}"] .avatar`) as HTMLElement | null;
  const live = avatar?.getBoundingClientRect();
  if (live && live.width > 1 && live.height > 1) return live;
  return next.get(`player:${playerId}`);
}

function calmNewFront(root: HTMLElement, collectedIds: Set<string>): (() => void) | null {
  const front = root.querySelector('.line-slot.front .card-noble') as HTMLElement | null;
  const id = front?.dataset.instance;
  if (!front || !id || collectedIds.has(id) || !front.classList.contains('frightened')) return null;
  const img = front.querySelector('img') as HTMLImageElement | null;
  const fearSrc = img?.getAttribute('src') ?? '';
  front.classList.remove('frightened');
  if (img && fearSrc.includes('-fear.png')) img.src = fearSrc.replace('-fear.png', '.png');
  return () => {
    front.classList.add('frightened');
    if (img && fearSrc) img.src = fearSrc;
  };
}

function flipCards(
  prev: Map<string, DOMRect>,
  next: Map<string, DOMRect>,
  skip: Set<string>,
  delay = 0,
  onPlay?: (() => void) | null,
): void {
  const jobs: Array<{ el: HTMLElement; dx: number; dy: number }> = [];
  const queue = (el: HTMLElement, old: DOMRect, newRect: DOMRect) => {
    const dx = old.left - newRect.left;
    const dy = old.top - newRect.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    jobs.push({ el, dx, dy });
  };

  for (const [key, newRect] of next) {
    if (!key.startsWith('slot:')) continue;
    if (skip.has(key) || skip.has(`card:${key.slice(5)}`)) continue;
    const old = prev.get(key);
    if (!old) continue;
    const el = document.querySelector<HTMLElement>(`.line-slot[data-line-id="${key.slice(5)}"]`);
    if (el) queue(el, old, newRect);
  }

  for (const [key, newRect] of next) {
    if (!key.startsWith('card:')) continue;
    if (skip.has(key)) continue;
    const old = prev.get(key);
    if (!old) continue;
    const el = document.querySelector<HTMLElement>(`[data-instance="${key.slice(5)}"]`);
    if (!el || el.closest('.line-slot') || el.closest('.play-reveal')) continue;
    queue(el, old, newRect);
  }

  if (!jobs.length) {
    if (delay) window.setTimeout(() => onPlay?.(), delay);
    else onPlay?.();
    return;
  }
  jobs.sort((a, b) => Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)));
  const pin = () => {
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      job.el.classList.add('is-flipping');
      job.el.style.zIndex = String(100 + i);
      job.el.style.transition = 'none';
      job.el.style.transform = `translate(${job.dx}px, ${job.dy}px)`;
    }
  };
  const playAll = () => {
    onPlay?.();
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i]!;
      job.el.classList.add('is-flipping');
      job.el.style.zIndex = String(100 + i);
      const anim = job.el.animate(
        [{ transform: `translate(${job.dx}px, ${job.dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: FLIP_MS, easing: 'cubic-bezier(0.22, 0.82, 0.16, 1)' },
      );
      const done = () => {
        job.el.classList.remove('is-flipping');
        job.el.style.transform = '';
        job.el.style.transition = '';
        job.el.style.zIndex = '';
      };
      anim.addEventListener('finish', done);
      window.setTimeout(done, FLIP_MS + 80);
    }
  };
  if (delay) {
    pin();
    window.setTimeout(playAll, delay);
  } else playAll();
}

function ensureFxLayer(): HTMLElement {
  let layer = document.getElementById('fx-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'fx-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

function sliceThenFly(
  layer: HTMLElement,
  html: string,
  from: DOMRect | undefined,
  to: DOMRect | undefined,
  delay: number,
  onDone?: () => void,
): void {
  if (!from) {
    fly(layer, html, from, to, { delay, onDone });
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'fx-slice';
  wrap.style.left = `${from.left}px`;
  wrap.style.top = `${from.top}px`;
  wrap.style.width = `${from.width}px`;
  wrap.style.height = `${from.height}px`;
  wrap.innerHTML = `<div class="fx-half top">${html}</div><div class="fx-half bottom">${html}</div>`;
  layer.appendChild(wrap);
  window.setTimeout(() => {
    playSfx('slice');
    wrap.classList.add('cut');
  }, delay);
  window.setTimeout(() => {
    wrap.remove();
    fly(layer, html, from, to, { onDone });
  }, delay + SLICE_MS);
}

function fly(
  layer: HTMLElement,
  html: string,
  from: DOMRect | undefined,
  to: DOMRect | undefined,
  opts: { delay?: number; onDone?: () => void; shrinkFirst?: boolean } = {},
): void {
  const delay = opts.delay ?? 0;
  if (!from || !to) {
    opts.onDone?.();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'fx-flyer';
  wrap.innerHTML = html;
  const startW = Math.max(40, from.width);
  const startH = Math.max(56, from.height);
  const endW = Math.max(40, to.width);
  const endH = Math.max(56, to.height);
  wrap.style.left = `${from.left}px`;
  wrap.style.top = `${from.top}px`;
  wrap.style.width = `${startW}px`;
  wrap.style.height = `${startH}px`;
  wrap.style.zIndex = '200';
  const flyerCard = wrap.querySelector('.card') as HTMLElement | null;
  const syncFont = (w: number) => {
    if (flyerCard) flyerCard.style.fontSize = `${(13 * w) / 132}px`;
  };
  syncFont(startW);
  layer.appendChild(wrap);
  void wrap.offsetWidth;

  const moveToDest = () => {
    wrap.style.left = `${to.left}px`;
    wrap.style.top = `${to.top}px`;
    wrap.style.width = `${endW}px`;
    wrap.style.height = `${endH}px`;
    wrap.style.transform = 'none';
    syncFont(endW);
  };

  const start = () => {
    const shouldShrink = Boolean(opts.shrinkFirst) && startW > endW * 1.2;
    if (shouldShrink) {
      wrap.style.transitionDuration = `${SHRINK_MS}ms`;
      wrap.style.left = `${from.left + (startW - endW) / 2}px`;
      wrap.style.top = `${from.top + (startH - endH) / 2}px`;
      wrap.style.width = `${endW}px`;
      wrap.style.height = `${endH}px`;
      syncFont(endW);
      window.setTimeout(() => {
        wrap.style.transitionDuration = `${FLY_MS}ms`;
        moveToDest();
      }, SHRINK_MS);
    } else {
      wrap.style.transitionDuration = `${FLY_MS}ms`;
      moveToDest();
    }
  };

  const extra = opts.shrinkFirst && startW > endW * 1.2 ? SHRINK_MS : 0;
  const go = () => requestAnimationFrame(() => requestAnimationFrame(start));
  if (delay) window.setTimeout(go, delay);
  else go();
  window.setTimeout(() => {
    wrap.remove();
    opts.onDone?.();
  }, delay + extra + FLY_MS + 40);
}
