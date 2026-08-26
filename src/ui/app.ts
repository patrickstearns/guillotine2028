import type { LobbySnapshot, RoomView } from '../net';
import type { GamePublicState, PlayerResult, PrivateHand, AnimEvent } from '../../shared/types';
import * as net from '../net';
import { buildHouseRules } from '../../shared/houseRules';
import { renderLobby } from './lobby';
import { renderWaiting } from './waiting';
import { renderGame } from './game';
import { renderResults, startTally } from './results';
import { runBoardAnimations, snapshotRects } from './fx';

type Screen = 'name' | 'lobby' | 'waiting' | 'game' | 'results';

let pileBrowse: 'action' | 'noble' | null = null;

let screen: Screen = 'name';
let lobby: LobbySnapshot = { players: [], games: [] };
let room: RoomView | null = null;
let gamePublic: GamePublicState | null = null;
let hand: PrivateHand = { hand: [] };
let results: PlayerResult[] | null = null;
let root: HTMLElement;
let heldScores: Record<string, number> | null = null;
let pointerX = 0;
let pointerY = 0;
let pointerTracked = false;
let confirmHostLeave = false;
let hostCancelledNotice = false;
let droppedNotice: string | null = null;

function pointerInRect(r: DOMRect): boolean {
  return pointerTracked && pointerX >= r.left && pointerX <= r.right && pointerY >= r.top && pointerY <= r.bottom;
}

function pinHandRail(rail: HTMLElement | null, expanded: boolean, instant = false): void {
  if (!rail) return;
  if (instant) rail.classList.add('hand-instant');
  rail.classList.toggle('hand-up', expanded);
  if (instant) {
    void rail.offsetHeight;
    rail.classList.remove('hand-instant');
  }
}

export function mountApp(el: HTMLElement): void {
  root = el;
  net.connect({
    onLobby: (l) => {
      lobby = l;
      if (screen === 'lobby' || screen === 'name') paint();
    },
    onRoom: (r) => {
      room = r;
      if (r.started) screen = 'game';
      else screen = 'waiting';
      paint();
    },
    onRoomCancelled: () => {
      room = null;
      gamePublic = null;
      results = null;
      confirmHostLeave = false;
      hostCancelledNotice = true;
      screen = 'lobby';
      paint();
    },
    onDropped: (payload) => {
      room = null;
      gamePublic = null;
      results = null;
      hand = { hand: [] };
      lobby = payload.lobby;
      droppedNotice = `${payload.name} was dropped`;
      screen = 'lobby';
      paint();
    },
    onGame: (payload) => {
      const prev = screen === 'game' ? snapshotRects(root) : null;
      const anims: AnimEvent[] = payload.public.anims ?? [];
      const collecting = anims.some((a) => a.type === 'collect_noble');
      heldScores =
        collecting && gamePublic
          ? Object.fromEntries(gamePublic.players.map((p) => [p.id, p.score]))
          : null;
      gamePublic = payload.public;
      hand = payload.hand;
      results = payload.results;
      if (payload.public.phase === 'results') screen = 'results';
      else screen = 'game';
      paint();
      if (screen === 'game') {
        requestAnimationFrame(() =>
          runBoardAnimations({
            root,
            prev,
            anims,
            onCollectLanded: commitHeldScores,
          }),
        );
      }
    },
  });
  window.addEventListener('resize', () => {
    if (screen === 'game') scaleSidebarCards(root);
  });
  window.addEventListener(
    'pointermove',
    (ev) => {
      pointerTracked = true;
      pointerX = ev.clientX;
      pointerY = ev.clientY;
    },
    { passive: true },
  );
  paint();
}

function commitHeldScores(): void {
  if (!heldScores) return;
  heldScores = null;
  root.querySelectorAll<HTMLElement>('.pscore[data-score]').forEach((el) => {
    el.textContent = el.dataset.score ?? el.textContent;
  });
}

function paint(): void {
  if (screen === 'name') {
    root.innerHTML = `
      <div class="screen splash">
        <div class="splash-bg"></div>
        <header class="splash-brand">
          <h1>Guillotine 2028</h1>
        </header>
        <form class="name-form" id="name-form">
          <label for="callsign">Callsign</label>
          <input id="callsign" name="name" maxlength="24" placeholder="Your name" required autocomplete="nickname" />
          <button type="submit">Enter Lobby</button>
        </form>
      </div>
    `;
    root.querySelector('#name-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const name = String(fd.get('name') || 'Player');
      const res = await net.joinLobby(name);
      if (res.ok && res.lobby) {
        lobby = res.lobby;
        screen = 'lobby';
        paint();
      }
    });
    return;
  }

  if (screen === 'lobby') {
    root.innerHTML = renderLobby(lobby, net.getPlayerName() ?? '');
    wireLobby();
    attachDialogs();
    return;
  }

  if (screen === 'waiting' && room) {
    root.innerHTML = renderWaiting(room, net.getPlayerId()!);
    wireWaiting();
    attachDialogs();
    return;
  }

  if (screen === 'results' && results) {
    root.innerHTML = renderResults(results);
    startTally(root, results);
    root.querySelector('#exit-lobby')?.addEventListener('click', async () => {
      const res = await net.exitToLobby();
      if (res.lobby) lobby = res.lobby;
      room = null;
      gamePublic = null;
      results = null;
      screen = 'lobby';
      paint();
    });
    return;
  }

  if (screen === 'game' && !gamePublic) {
    root.innerHTML = `<div class="screen lobby"><p class="muted" style="padding:2rem">Rejoining game…</p></div>`;
    return;
  }

  if (gamePublic) {
    const me = net.getPlayerId();
    if (gamePublic.targeting?.effect.kind === 'from_discard' && gamePublic.targeting.playerId === me) {
      pileBrowse = 'action';
    }
    const keepHandUp = (() => {
      const rail = root.querySelector('#hand-rail') as HTMLElement | null;
      if (!rail) return false;
      return rail.classList.contains('hand-up') || rail.matches(':hover') || pointerInRect(rail.getBoundingClientRect());
    })();
    root.innerHTML = renderGame(gamePublic, hand, me!, pileBrowse, heldScores);
    pinHandRail(root.querySelector('#hand-rail'), keepHandUp, true);
    wireGame();
    scaleSidebarCards(root);
  }
}

function wireLobby(): void {
  root.querySelector('#create-game')?.addEventListener('click', async () => {
    const name = (root.querySelector('#game-name') as HTMLInputElement)?.value;
    const maxPlayers = Number((root.querySelector('#max-players') as HTMLSelectElement)?.value || 5);
    const noPremature = !!(root.querySelector('#no-premature-endings') as HTMLInputElement)?.checked;
    const res = await net.createGame({
      name,
      maxPlayers,
      houseRules: buildHouseRules({ noPrematureEndings: noPremature }),
    });
    if (res.ok && res.room) {
      room = res.room;
      screen = 'waiting';
      paint();
    } else alert(res.error ?? 'Could not create');
  });

  root.querySelector('#create-test-game')?.addEventListener('click', async () => {
    const res = await net.createTestGame();
    if (res.ok && res.room) {
      room = res.room;
      screen = res.room.started ? 'game' : 'waiting';
      paint();
    } else alert(res.error ?? 'Could not create test game');
  });

  root.querySelectorAll('[data-join]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.join!;
      const res = await net.joinGame(id);
      if (res.ok && res.room) {
        room = res.room;
        screen = res.room.started ? 'game' : 'waiting';
        paint();
      } else alert(res.error ?? 'Could not join');
    });
  });
}

function attachDialogs(): void {
  if (confirmHostLeave) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="modal-backdrop" id="host-leave-dialog">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="host-leave-msg">
          <p id="host-leave-msg">Leaving the Lobby will cancel this game.  Are you sure?</p>
          <div class="modal-actions">
            <button type="button" class="primary" id="host-leave-yes">Yes</button>
            <button type="button" class="ghost" id="host-leave-no">No</button>
          </div>
        </div>
      </div>`,
    );
    root.querySelector('#host-leave-yes')?.addEventListener('click', async () => {
      const res = await net.cancelGame();
      confirmHostLeave = false;
      if (res.lobby) lobby = res.lobby;
      room = null;
      screen = 'lobby';
      paint();
    });
    root.querySelector('#host-leave-no')?.addEventListener('click', () => {
      confirmHostLeave = false;
      paint();
    });
  }

  if (hostCancelledNotice) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="modal-backdrop" id="host-cancelled-dialog">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="host-cancelled-msg">
          <p id="host-cancelled-msg">The host cancelled.</p>
          <div class="modal-actions">
            <button type="button" class="primary" id="host-cancelled-ok">OK</button>
          </div>
        </div>
      </div>`,
    );
    root.querySelector('#host-cancelled-ok')?.addEventListener('click', () => {
      hostCancelledNotice = false;
      paint();
    });
  }

  if (droppedNotice) {
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="modal-backdrop" id="dropped-dialog">
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="dropped-msg">
          <p id="dropped-msg">${droppedNotice.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>
          <div class="modal-actions">
            <button type="button" class="primary" id="dropped-ok">OK</button>
          </div>
        </div>
      </div>`,
    );
    root.querySelector('#dropped-ok')?.addEventListener('click', () => {
      droppedNotice = null;
      paint();
    });
  }
}

function wireWaiting(): void {
  root.querySelector('#leave-room')?.addEventListener('click', async () => {
    if (room && room.hostId === net.getPlayerId()) {
      confirmHostLeave = true;
      paint();
      return;
    }
    const res = await net.leaveGame();
    if (res.lobby) lobby = res.lobby;
    room = null;
    screen = 'lobby';
    paint();
  });

  root.querySelector('#start-game')?.addEventListener('click', async () => {
    const res = await net.startGame(0);
    if (!res.ok) alert(res.error ?? 'Could not start');
  });

  root.querySelectorAll('[data-add-ai]').forEach((el) => {
    el.addEventListener('click', async () => {
      const res = await net.addAiPlayer();
      if (!res.ok) alert(res.error ?? 'Could not add AI');
      if (res.room) {
        room = res.room;
        paint();
      }
    });
  });

  root.querySelectorAll('[data-remove-ai]').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = (el as HTMLElement).dataset.removeAi!;
      const res = await net.removeAiPlayer(id);
      if (!res.ok) alert(res.error ?? 'Could not remove AI');
      if (res.room) {
        room = res.room;
        paint();
      }
    });
  });
}

function wireGame(): void {
  const rail = root.querySelector('#hand-rail') as HTMLElement | null;
  const cards = root.querySelector('.hand-cards');
  cards?.addEventListener('pointerenter', () => pinHandRail(rail, true));
  cards?.addEventListener('pointerleave', (ev) => {
    const next = (ev as PointerEvent).relatedTarget as Node | null;
    if (next && rail?.contains(next)) return;
    pinHandRail(rail, false);
  });
  root.querySelector('#gear-btn')?.addEventListener('click', () => {
    root.querySelector('#gear-menu')?.classList.toggle('open');
  });
  root.querySelector('#quit-lobby')?.addEventListener('click', async () => {
    const res = await net.exitToLobby();
    if (res.lobby) lobby = res.lobby;
    room = null;
    gamePublic = null;
    screen = 'lobby';
    paint();
  });

  root.querySelector('.card-skip')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    void net.skipAction();
  });

  root.querySelectorAll('.hand-rail .card-action').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (document.body.classList.contains('card-zoomed')) {
        ev.preventDefault();
        ev.stopPropagation();
        closeCardZoom();
        return;
      }
      const id = (el as HTMLElement).dataset.instance!;
      if ((el as HTMLElement).classList.contains('unplayable')) return;
      if (gamePublic?.targeting) return;
      void net.playCard(id);
    });
  });

  root.querySelectorAll('.player-row.me .card-action.selectable').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (gamePublic?.targeting) return;
      ev.preventDefault();
      ev.stopPropagation();
      const id = (el as HTMLElement).dataset.instance!;
      void net.discardFront(id);
    });
  });

  wireCardZoom(root);
  wireLineScroll(root);
  wirePlayerPick(root, gamePublic);
  wirePileBrowser(root, gamePublic);

  if (gamePublic?.targeting?.playerId === net.getPlayerId()) {
    wireTargeting(root, gamePublic);
  }
}

let zoomClone: HTMLElement | null = null;

function closeCardZoom(): void {
  const overlay = document.querySelector('.card-zoom-overlay') as HTMLElement | null;
  const clone = overlay?.querySelector('.card') as HTMLElement | null;
  const origin = overlay?.dataset.origin;
  const source = origin ? (document.querySelector(`[data-instance="${origin}"]`) as HTMLElement | null) : null;
  if (overlay && clone && source) {
    const r = source.getBoundingClientRect();
    overlay.classList.add('closing');
    overlay.classList.remove('lit');
    clone.style.left = `${r.left}px`;
    clone.style.top = `${r.top}px`;
    clone.style.transform = `scale(${r.width / clone.offsetWidth}, ${r.height / clone.offsetHeight})`;
    window.setTimeout(() => overlay.remove(), 300);
  } else {
    overlay?.remove();
  }
  document.body.classList.remove('card-zoomed');
  zoomClone = null;
}

function openCardZoom(source: HTMLElement): void {
  closeCardZoom();
  const r = source.getBoundingClientRect();
  const overlay = document.createElement('div');
  overlay.className = 'card-zoom-overlay';
  overlay.dataset.origin = source.dataset.instance ?? '';
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove('compact', 'selectable', 'selected');
  const destW = Math.min(360, window.innerWidth * 0.78);
  const destH = Math.min(destW * (210 / 132), window.innerHeight * 0.84);
  clone.style.position = 'fixed';
  clone.style.margin = '0';
  clone.style.zIndex = '2';
  clone.style.width = `${destW}px`;
  clone.style.height = 'auto';
  clone.style.aspectRatio = '132 / 210';
  clone.style.minHeight = '0';
  clone.style.fontSize = `${(13 * destW) / 132}px`;
  clone.style.left = `${r.left}px`;
  clone.style.top = `${r.top}px`;
  clone.style.transformOrigin = 'top left';
  clone.style.transition = 'none';
  const startScale = r.width / destW;
  clone.style.transform = `scale(${startScale})`;
  overlay.appendChild(clone);
  document.body.appendChild(overlay);
  document.body.classList.add('card-zoomed');
  zoomClone = clone;
  void clone.offsetWidth;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('lit');
      clone.style.left = `${(window.innerWidth - destW) / 2}px`;
      clone.style.top = `${(window.innerHeight - destH) / 2}px`;
      clone.style.transform = 'scale(1)';
    });
  });

  const dismiss = (ev: Event) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeCardZoom();
  };
  overlay.addEventListener('click', dismiss);
  overlay.addEventListener(
    'wheel',
    (ev) => {
      if (ev.deltaY > 0) dismiss(ev);
    },
    { passive: false },
  );
}

function wireCardZoom(scope: HTMLElement): void {
  scope.querySelectorAll('.card').forEach((card) => {
    card.addEventListener(
      'wheel',
      (ev) => {
        const e = ev as WheelEvent;
        if (!card.matches(':hover')) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.deltaY < 0) {
          if (card.classList.contains('selectable')) return;
          openCardZoom(card as HTMLElement);
        } else if (document.body.classList.contains('card-zoomed')) {
          closeCardZoom();
        }
      },
      { passive: false },
    );
  });

  // Click anywhere while zoomed (except we handle overlay) — also catch document
  if (!(window as unknown as { __g28ZoomDoc?: boolean }).__g28ZoomDoc) {
    (window as unknown as { __g28ZoomDoc?: boolean }).__g28ZoomDoc = true;
    document.addEventListener(
      'click',
      () => {
        if (document.body.classList.contains('card-zoomed')) closeCardZoom();
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (ev) => {
        if (ev.key === 'Escape') closeCardZoom();
      },
      true,
    );
  }
}

let lineScrollLeft = 0;

function wireLineScroll(scope: HTMLElement): void {
  const line = scope.querySelector('#noble-line') as HTMLElement | null;
  const wrap = scope.querySelector('.line-wrap') as HTMLElement | null;
  const right = scope.querySelector('#line-scroll-right') as HTMLElement | null;
  const left = scope.querySelector('#line-scroll-left') as HTMLElement | null;
  if (!line || !wrap || !right || !left) return;

  line.scrollLeft = lineScrollLeft;

  if (gamePublic?.phase === 'revealing' || gamePublic?.revealedPlay) {
    lineScrollLeft = 0;
    line.scrollTo({ left: 0, behavior: 'smooth' });
  }

  const sync = () => {
    lineScrollLeft = line.scrollLeft;
    const overflow = line.scrollWidth > line.clientWidth + 4;
    const atEnd = line.scrollLeft + line.clientWidth >= line.scrollWidth - 8;
    const atStart = line.scrollLeft <= 8;
    wrap.classList.toggle('can-right', overflow && !atEnd);
    wrap.classList.toggle('can-left', overflow && !atStart);
  };
  sync();
  line.addEventListener('scroll', sync);

  const hold = (dir: number, btn: HTMLElement) => {
    let ticking = false;
    const step = () => {
      if (!ticking) return;
      line.scrollLeft += dir * 12;
      sync();
      requestAnimationFrame(step);
    };
    btn.addEventListener('mouseenter', () => {
      ticking = true;
      requestAnimationFrame(step);
    });
    btn.addEventListener('mouseleave', () => {
      ticking = false;
    });
  };
  hold(1, right);
  hold(-1, left);
}

function wirePileBrowser(scope: HTMLElement, state: GamePublicState | null): void {
  const picking =
    state?.targeting?.effect.kind === 'from_discard' &&
    state.targeting.playerId === net.getPlayerId();

  scope.querySelector('#discard-pile')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    pileBrowse = 'action';
    paint();
  });
  scope.querySelector('#noble-discard-pile')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    pileBrowse = 'noble';
    paint();
  });

  const close = () => {
    if (picking) return;
    pileBrowse = null;
    paint();
  };
  scope.querySelector('#pile-browser-close')?.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    close();
  });
  scope.querySelector('#pile-browser')?.addEventListener('click', (ev) => {
    if (ev.target === ev.currentTarget) close();
  });

  if (picking) {
    scope.querySelectorAll('#pile-browser .card-action').forEach((el) => {
      el.addEventListener('click', (ev) => {
        if (document.body.classList.contains('card-zoomed')) return;
        ev.preventDefault();
        ev.stopPropagation();
        const id = (el as HTMLElement).dataset.instance;
        if (!id) return;
        pileBrowse = null;
        void net.submitTargets([id]);
      });
    });
  }
}

function wirePlayerPick(scope: HTMLElement, state: GamePublicState | null): void {
  const overlay = scope.querySelector('#player-pick');
  if (!overlay || !state?.targeting) return;
  if (state.targeting.picks.length) return;
  overlay.querySelectorAll('.pick-seat:not(:disabled)').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const pid = (btn as HTMLElement).dataset.player;
      if (!pid) return;
      overlay.querySelectorAll('.pick-seat').forEach((b) => {
        (b as HTMLButtonElement).disabled = true;
        b.classList.toggle('chosen', (b as HTMLElement).dataset.player === pid);
      });
      void (async () => {
        await net.previewTargets([pid]);
        window.setTimeout(() => void net.submitTargets([pid]), 1000);
      })();
    });
  });
}

function scaleSidebarCards(scope: HTMLElement): void {
  const inner = scope.querySelector('.sidebar-inner') as HTMLElement | null;
  if (!inner) return;
  const seats = Number(inner.style.getPropertyValue('--seats') || 1);
  const rowH = Math.max(72, (window.innerHeight - 48) / Math.max(1, seats));
  let cardH = Math.min(118, Math.max(64, rowH - 52));
  let cardW = cardH * (132 / 210);
  const maxCards = Math.max(
    1,
    ...[...inner.querySelectorAll('.player-row')].map((r) => r.querySelectorAll('.card').length),
  );
  const avail = Math.min(window.innerWidth * 0.55, window.innerWidth - 420) - 92;
  if (maxCards * (cardW + 4) > avail) {
    cardW = Math.max(40, avail / maxCards - 4);
    cardH = cardW * (210 / 132);
  }
  inner.style.setProperty('--mini-h', `${cardH}px`);
  inner.style.setProperty('--mini-w', `${cardW}px`);
}

function wireTargeting(scope: HTMLElement, state: GamePublicState): void {
  const effect = state.targeting!.effect;
  const picks: string[] = [];
  const orderPicks: string[] = [];
  let moveFromIndex: number | null = null;

  const commit = (finalPicks: string[]) => void net.submitTargets(finalPicks);

  const oneShot = [
    'move_forward_exact',
    'move_back_exact_extra',
    'move_to_front',
    'move_suit_to_front',
    'remove_from_line',
    'discard_and_replace',
    'give_front_to_player',
    'skip_opponent_turn',
    'penalty',
    'front_penalty',
    'random_lose_noble',
    'swap_hands',
    'discard_front_card',
    'place_clown',
    'missed',
  ];

  const mark = (el: HTMLElement) => {
    scope.querySelectorAll('#noble-line .selected').forEach((x) => x.classList.remove('selected'));
    el.classList.add('selected');
  };

  const moveKinds = effect.kind === 'move_forward' || effect.kind === 'move_back' || effect.kind === 'move_suit_forward';
  const moveMax = moveKinds && 'max' in effect ? effect.max : 0;

  const destOk = (si: number, from: number) => {
    if (effect.kind === 'move_back') return si > from && si <= from + moveMax;
    return si < from && si >= from - moveMax;
  };

  const finishMove = (dest: number) => {
    if (moveFromIndex === null || !picks[0]) return;
    commit([picks[0], String(Math.abs(dest - moveFromIndex))]);
  };

  const paintDrops = (from: number) => {
    scope.querySelectorAll('.line-drop').forEach((n) => n.remove());
    scope.querySelectorAll('.drop-slot').forEach((s) => s.classList.remove('drop-slot'));
    scope.querySelectorAll('.line-slot').forEach((s) => {
      const slot = s as HTMLElement;
      const si = Number(slot.dataset.lineIndex);
      if (!destOk(si, from)) return;
      slot.classList.add('drop-slot');
      const gap = document.createElement('button');
      gap.type = 'button';
      gap.className = 'line-drop';
      gap.dataset.lineIndex = String(si);
      gap.setAttribute('aria-label', `Place here (${si + 1})`);
      if (effect.kind === 'move_back') slot.after(gap);
      else slot.before(gap);
      gap.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        finishMove(si);
      });
    });
  };

  scope.querySelectorAll('#noble-line .card-noble.selectable').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const card = el as HTMLElement;
      const id = card.dataset.instance!;
      const slot = card.closest('.line-slot') as HTMLElement | null;
      const idx = Number(slot?.dataset.lineIndex ?? -1);

      if (effect.kind === 'rearrange_front_n') {
        if (orderPicks.includes(id)) return;
        orderPicks.push(id);
        card.classList.add('selected');
        if (orderPicks.length >= Math.min(effect.n, state.line.length)) commit(orderPicks);
        return;
      }

      if (moveKinds) {
        if (moveFromIndex !== null && slot?.classList.contains('drop-slot')) {
          finishMove(idx);
          return;
        }
        picks.length = 0;
        picks.push(id);
        moveFromIndex = idx;
        mark(card);
        paintDrops(idx);
        const hint = scope.querySelector('#target-hint p');
        if (hint) hint.textContent = 'Now click a highlighted gap — that is the landing spot, not a new figure.';
        return;
      }

      if (oneShot.includes(effect.kind)) {
        commit([id]);
      }
    });
  });

  scope.querySelectorAll('.line-slot').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (!el.classList.contains('drop-slot') || moveFromIndex === null || !picks[0]) return;
      ev.preventDefault();
      ev.stopPropagation();
      finishMove(Number((el as HTMLElement).dataset.lineIndex));
    });
  });

      scope.querySelectorAll('.player-row.selectable').forEach((el) => {
    el.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const pid = (el as HTMLElement).dataset.player!;
      if (oneShot.includes(effect.kind)) commit([pid]);
    });
  });

  if (effect.kind === 'discard_from_hand' && (state.targeting?.step ?? 0) === 1) {
    const victimId = state.targeting?.picks[0];
    scope.querySelectorAll('#hand-peek .card-action.selectable').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = (el as HTMLElement).dataset.instance!;
        if (!victimId) return;
        commit([victimId, id]);
      });
    });
  }

  if (effect.kind === 'clerical_error') {
    const victimId = state.targeting?.picks[0];
    const step = state.targeting?.step ?? 0;
    if (step === 1 && victimId) {
      scope.querySelectorAll(`.player-row[data-player="${victimId}"] .card-noble.selectable`).forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          commit([victimId, (el as HTMLElement).dataset.instance!]);
        });
      });
    }
    if (step === 2) {
      scope.querySelectorAll('.card-noble.selectable').forEach((el) => {
        el.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          commit([(el as HTMLElement).dataset.instance!]);
        });
      });
    }
  }

  if (effect.kind === 'discard_n_from_hand' && 'count' in effect && (state.targeting?.step ?? 0) === 1) {
    const need = effect.count;
    scope.querySelectorAll('.hand-rail .card-action').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const id = (el as HTMLElement).dataset.instance!;
        if (picks.includes(id)) return;
        picks.push(id);
        (el as HTMLElement).classList.add('selected');
        if (picks.length >= need) commit([...picks]);
      });
    });
  }

  if (effect.kind === 'discard_front_card') {
    scope.querySelectorAll('.sidebar .card-action.selectable').forEach((el) => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        commit([(el as HTMLElement).dataset.instance!]);
      });
    });
  }
}
