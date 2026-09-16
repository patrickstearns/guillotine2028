import { actionById, nobleById } from '../../shared/cards';
import { actionPlayBlock, frontBlocksActions, PLAYER_TARGET_KINDS } from '../../shared/playable';
import type { ActionEffect, GamePublicState, PrivateHand } from '../../shared/types';
import { actionCardHtml, nobleCardHtml, cardBackHtml, skipCardHtml } from './cards';

const LINE_PICK_KINDS: ActionEffect['kind'][] = [
  'move_forward',
  'move_forward_exact',
  'move_back',
  'move_back_exact_extra',
  'move_to_front',
  'move_suit_forward',
  'move_suit_to_front',
  'move_ability_to_front',
  'remove_from_line',
  'discard_and_replace',
  'rearrange_front_n',
];

const PLAYER_PICK_KINDS: ActionEffect['kind'][] = [...PLAYER_TARGET_KINDS];

const SIDEBAR_TARGET_KINDS: ActionEffect['kind'][] = [
  'clerical_error',
  'discard_front_card',
];

const PLAYER_COLORS = ['#d94a3d', '#3d8fd9', '#3db86a', '#d9a13d', '#9b5de5'];

function playerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length]!;
}

export function renderGame(
  state: GamePublicState,
  hand: PrivateHand,
  myId: string,
  pileBrowse: 'action' | 'noble' | null = null,
  heldScores?: Record<string, number> | null,
): string {
  const hr = { houseRules: state.houseRules };
  const myTurn = state.currentPlayerId === myId && state.phase === 'action';
  const targeting = state.targeting?.playerId === myId;
  const effect = state.targeting?.effect;
  const clericalStep = effect?.kind === 'clerical_error' ? state.targeting?.step ?? 0 : -1;
  const infightStep = effect?.kind === 'discard_n_from_hand' ? state.targeting?.step ?? 0 : -1;
  const lackStep = effect?.kind === 'discard_from_hand' ? state.targeting?.step ?? 0 : -1;
  const hideHint =
    !targeting ||
    !effect ||
    (PLAYER_PICK_KINDS.includes(effect.kind) &&
      clericalStep !== 1 &&
      clericalStep !== 2 &&
      infightStep !== 1 &&
      lackStep !== 1) ||
    (effect.kind === 'clerical_error' && clericalStep === 0) ||
    (effect.kind === 'discard_from_hand' && lackStep === 0) ||
    effect.kind === 'from_discard' ||
    effect.kind === 'late_arrival';
  const hint = hideHint ? '' : targetHint(effect, state.line.length, clericalStep, lackStep);

  const sidebar = state.players
    .map((p, seat) => {
      const t = targeting && effect?.kind === 'clerical_error' ? state.targeting : null;
      const steal = !!(t && t.step === 1 && t.playerId === myId && p.id === t.picks[0]);
      const give = !!(
        t &&
        t.step === 2 &&
        t.playerId === myId &&
        p.id === state.currentPlayerId
      );
      const arrivingNobles = new Set(
        (state.anims ?? []).filter((a) => a.type === 'collect_noble').map((a) => a.instanceId),
      );
      const arrivingFronts = new Set(
        (state.anims ?? []).filter((a) => a.type === 'play_front').map((a) => a.instanceId),
      );
      const nobles = p.collected
        .map((n) =>
          nobleCardHtml(n, {
            compact: true,
            ...hr,
            selectable:
              steal || (give && n.instanceId !== state.targeting?.picks[1]),
            arriving: arrivingNobles.has(n.instanceId),
          }),
        )
        .join('');
      const fronts = p.frontCards
        .map((f) => {
          const def = actionById(f.defId);
          const myCallous = p.id === myId && def?.effect.kind === 'callous_guards';
          return actionCardHtml(f, {
            compact: true,
            selectable:
              (targeting && effect?.kind === 'discard_front_card') || myCallous,
            arriving: arrivingFronts.has(f.instanceId),
          });
        })
        .join('');
      const robot = p.isAi
        ? `<svg class="ai-icon" viewBox="0 0 16 16" aria-label="AI"><rect x="4" y="5" width="8" height="7" rx="1.2" fill="currentColor"/><rect x="7.2" y="2" width="1.6" height="3" fill="currentColor"/><circle cx="8" cy="2" r="1.1" fill="currentColor"/><circle cx="6.3" cy="8" r="1" fill="#1c1410"/><circle cx="9.7" cy="8" r="1" fill="#1c1410"/></svg>`
        : '';
      return `
        <div class="player-row ${p.id === state.currentPlayerId && state.phase !== 'day_intro' ? 'active' : ''} ${p.id === myId ? 'me' : ''}" data-player="${p.id}">
          <div class="player-idcol">
            <div class="avatar" style="--avatar:${playerColor(seat)}">${escape(p.name.slice(0, 1))}</div>
            <div class="pscore" data-score="${p.score}">${heldScores?.[p.id] ?? p.score}</div>
            <div class="phand" title="${p.handCount} in hand">
              <svg class="hand-icon" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="1.5" y="4" width="7.5" height="10" rx="0.8" fill="currentColor" transform="rotate(-18 5.25 9)"/>
                <rect x="6.5" y="3.2" width="7.5" height="10" rx="0.8" fill="currentColor"/>
              </svg>
              <span>${p.handCount}</span>
            </div>
          </div>
          <div class="player-stack">
            <div class="pname">${escape(p.name)}${robot}</div>
            <div class="player-cards">${nobles}${fronts}${!nobles && !fronts ? '<span class="muted">—</span>' : ''}</div>
          </div>
        </div>`;
    })
    .join('');

  const dealing = new Set(
    (state.anims ?? []).filter((a) => a.type === 'deal_noble').map((a) => a.instanceId),
  );
  const line = state.line
    .map((n, i) => {
      const selectable = targeting && effect && lineCardSelectable(state, n.defId, i);
      const html = nobleCardHtml(n, { ...hr, selectable, frightened: i === 0 && !dealing.has(n.instanceId) });
      const cls = [
        'line-slot',
        i === 0 ? 'front' : '',
        dealing.has(n.instanceId) ? 'is-dealing' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<div class="${cls}" style="--i:${i}" data-line-index="${i}" data-line-id="${n.instanceId}">${html}<span class="pos">${i === 0 ? 'NEXT' : i + 1}</span></div>`;
    })
    .join('');

  const arrivingHand = new Set(
    (state.anims ?? []).filter((a) => a.type === 'draw_action').map((a) => a.instanceId),
  );
  const inboundDiscard = (state.anims ?? []).some((a) => a.type === 'discard_action');
  const inboundNobleDiscard = (state.anims ?? []).some((a) => a.type === 'discard_noble');
  const pickingHand = targeting && effect?.kind === 'discard_n_from_hand' && infightStep === 1;
  const canSkip = state.phase === 'action' && state.currentPlayerId === myId && !targeting;
  const actionBlockCause =
    canSkip && state.actionLocked
      ? 'Rush Job'
      : canSkip && frontBlocksActions(state)
        ? nobleById(state.line[0]?.defId)?.name ?? 'the front figure'
        : null;
  const actionBlockBanner = actionBlockCause
    ? `<div class="hand-block-banner" role="status">Unable to play Action Cards due to ${escape(actionBlockCause)}</div>`
    : '';
  const handHtml = `${hand.hand
    .map((c) => {
      const def = actionById(c.defId);
      const block = def && myTurn && !pickingHand ? actionPlayBlock(state, def.effect, myId) : null;
      return actionCardHtml(c, {
        unplayable: !!block,
        selectable: !!pickingHand,
        arriving: arrivingHand.has(c.instanceId),
      });
    })
    .join('')}${canSkip ? skipCardHtml() : ''}`;
  const myTurnBg = state.currentPlayerId === myId && (state.phase === 'action' || state.phase === 'targeting');
  const reveal = state.revealedPlay
    ? `<div class="play-reveal" id="play-reveal">${actionCardHtml({ instanceId: state.revealedPlay.instanceId, defId: state.revealedPlay.defId })}</div>`
    : '';

  const openSidebar =
    (targeting && effect && SIDEBAR_TARGET_KINDS.includes(effect.kind)) ||
    clericalStep === 1 ||
    clericalStep === 2;

  return `
    <div class="screen play ${targeting ? 'is-targeting' : ''} ${openSidebar ? 'force-sidebar' : ''} ${myTurnBg ? 'my-turn' : ''}">
      <aside class="sidebar" id="player-sidebar">
        <div class="sidebar-inner" style="--seats:${Math.max(1, state.players.length)}">${sidebar}</div>
      </aside>

      <div class="table">
        <header class="table-top">
          <div class="day-badge">Day ${state.day}</div>
          <div class="turn-label">${turnLabel(state, myId)}</div>
          <div class="header-actions">
            <div class="gear-wrap">
              <button type="button" id="gear-btn" class="gear" aria-label="Menu">⚙</button>
              <div id="gear-menu" class="gear-menu">
                <button type="button" id="quit-lobby">Quit to lobby</button>
              </div>
            </div>
          </div>
        </header>

        ${hint ? `<div class="target-hint" id="target-hint">${hint}</div>` : ''}

        <div class="board">
        <div class="line-wrap">
            <div class="noble-line" id="noble-line">
              <div class="stand-wrap line-stand">
                <img src="/assets/executioner-cutout.png" class="executioner-stand" alt="Executioner" />
              </div>
              ${
                line
                  ? line
                  : `<p class="muted">${
                      (state.anims ?? []).some((a) => a.type === 'discard_noble')
                        ? 'Remaining figures go to the discard…'
                        : state.phase === 'between_days'
                          ? 'Preparing the next day…'
                          : 'Line empty — day ending…'
                    }</p>`
              }
            </div>
            <button type="button" class="line-scroll left" id="line-scroll-left" aria-label="Scroll left">◂</button>
            <button type="button" class="line-scroll right" id="line-scroll-right" aria-label="Scroll right">▸</button>
          </div>

        <div class="decks-row">
          <div class="decks">
          <div class="pile" id="noble-draw-pile" title="Figures deck">
            ${cardBackHtml('noble')}
            <span class="pile-count">${state.nobleDeckCount ?? 0}</span>
            <span class="pile-label">Figures</span>
          </div>
          <div class="pile pile-browse" id="noble-discard-pile" title="Figures discard" role="button">
            ${state.nobleDiscardTopDefId ? nobleCardHtml({ instanceId: 'noble-discard-top', defId: state.nobleDiscardTopDefId }, { ...hr, arriving: inboundNobleDiscard }) : '<div class="pile-empty">Discard</div>'}
            <span class="pile-count">${state.nobleDiscardCount ?? 0}</span>
            <span class="pile-label">Heads out</span>
          </div>
          <div class="pile" id="draw-pile" title="Action deck">
            ${cardBackHtml()}
            <span class="pile-count">${state.actionDeckCount ?? 0}</span>
            <span class="pile-label">Draw</span>
          </div>
          <div class="pile pile-browse" id="discard-pile" title="Discard" role="button">
            ${state.discardTopDefId ? actionCardHtml({ instanceId: 'discard-top', defId: state.discardTopDefId }, { arriving: inboundDiscard }) : '<div class="pile-empty">Discard</div>'}
            <span class="pile-count">${state.discardCount ?? 0}</span>
            <span class="pile-label">Discard</span>
          </div>
          </div>
          <div class="log-strip">${state.log.slice(0, 8).map((l) => `<div>${escape(l)}</div>`).join('')}</div>
        </div>
        <div class="board-fill"></div>
        </div>

        <div class="hand-dock"></div>
        <div class="hand-rail ${myTurn || pickingHand ? 'can-play' : ''}" id="hand-rail">
          ${actionBlockBanner}
          <div class="hand-cards">${handHtml || '<p class="muted">Empty hand</p>'}</div>
        </div>
      </div>

      ${reveal}
      ${playerPickDialog(state, myId)}
      ${handPeekHtml(state, hand, myId)}
      ${noblePeekHtml(state, hand, myId)}
      ${selectingWaitHtml(state, myId)}
      ${pileBrowserHtml(state, myId, pileBrowse)}
      ${state.toast ? `<div class="toast" id="toast">${escape(state.toast)}</div>` : ''}
    </div>
  `;
}

function lineCardSelectable(state: GamePublicState, defId: string, index: number): boolean {
  const effect = state.targeting?.effect;
  if (!effect || !LINE_PICK_KINDS.includes(effect.kind)) return false;
  if (effect.kind === 'move_forward_exact') {
    return index >= effect.n;
  }
  if (effect.kind === 'move_back_exact_extra') {
    return index + effect.n <= state.line.length - 1;
  }
  if (effect.kind === 'move_suit_forward' || effect.kind === 'move_suit_to_front') {
    return nobleById(defId)?.suit === effect.suit;
  }
  if (effect.kind === 'move_ability_to_front') {
    return nobleById(defId)?.ability === effect.ability;
  }
  if (effect.kind === 'rearrange_front_n') {
    return index < Math.min(effect.n, state.line.length);
  }
  return true;
}

function targetHint(effect: ActionEffect, lineLen: number, clericalStep = -1, lackStep = -1): string {
  switch (effect.kind) {
    case 'move_forward':
    case 'move_suit_forward':
      return `<p>Click a figure in line, then click a highlighted gap or the place it should land.</p>`;
    case 'move_back':
      return `<p>Click a figure in line, then click a highlighted gap or the place it should land.</p>`;
    case 'move_forward_exact':
    case 'move_back_exact_extra':
    case 'move_to_front':
    case 'move_suit_to_front':
    case 'remove_from_line':
    case 'discard_and_replace':
      return `<p>Click a figure in the line.</p>`;
    case 'move_ability_to_front':
      return `<p>Click which Overzealous Staffer to move to the front.</p>`;
    case 'rearrange_front_n': {
      const k = Math.min(effect.n, lineLen);
      return `<p>Click ${k} figure${k === 1 ? '' : 's'} in the new order.</p>`;
    }
    case 'place_clown':
      return `<p>Click a player on the left — they get Late Night.</p>`;
    case 'missed':
      return `<p>Click another player — their last collected figure returns to the end of the line.</p>`;
    case 'front_penalty':
      return `<p>Click a player on the left — Tough Crowd sits in front of them (−2).</p>`;
    case 'give_front_to_player':
    case 'skip_opponent_turn':
    case 'penalty':
    case 'random_lose_noble':
    case 'swap_hands':
      return `<p>Click a player on the left.</p>`;
    case 'discard_from_hand':
      return lackStep === 1
        ? `<p>Click a card in their hand to discard.</p>`
        : `<p>Click a player on the left — look at their hand.</p>`;
    case 'late_arrival':
      return `<p>Click one figure to put at the end of the line.</p>`;
    case 'clerical_error':
      if (clericalStep === 2) return `<p>Click a figure in their score pile to take.</p>`;
      return `<p>Click a figure in their score pile to take.</p>`;
    case 'discard_n_from_hand':
      return `<p>Click ${effect.count} action cards in your hand to discard.</p>`;
    case 'discard_front_card':
      return `<p>Click a face-up action in a player's row.</p>`;
    case 'from_discard':
      return `<p>Choose a card from the action discard.</p>`;
    default:
      return `<p>Choose a target.</p>`;
  }
}

function handPeekHtml(state: GamePublicState, hand: PrivateHand, myId: string): string {
  const t = state.targeting;
  if (!t || t.playerId !== myId || t.effect.kind !== 'discard_from_hand' || (t.step ?? 0) !== 1) {
    return '';
  }
  const peek = hand.peekHand;
  const ownerName = peek?.ownerName ?? state.players.find((p) => p.id === t.picks[0])?.name ?? 'Player';
  const cards = (peek?.cards ?? [])
    .map((c) => actionCardHtml(c, { selectable: true }))
    .join('');
  return `<div class="hand-peek-overlay" id="hand-peek" role="dialog" aria-label="${escape(ownerName)}'s hand">
    <div class="hand-peek-panel">
      <p>${escape(ownerName)}'s hand — click a card to discard</p>
      <div class="hand-peek-cards">${cards || '<p class="muted">Empty hand</p>'}</div>
    </div>
  </div>`;
}

function noblePeekHtml(state: GamePublicState, hand: PrivateHand, myId: string): string {
  const t = state.targeting;
  if (!t || t.playerId !== myId || t.effect.kind !== 'late_arrival') return '';
  const cards = (hand.peekNobles?.cards ?? [])
    .map((n) => nobleCardHtml(n, { selectable: true, houseRules: state.houseRules }))
    .join('');
  return `<div class="hand-peek-overlay" id="noble-peek" role="dialog" aria-label="Late Arrival">
    <div class="hand-peek-panel">
      <p>Late Arrival — choose one figure for the end of the line</p>
      <div class="hand-peek-cards">${cards || '<p class="muted">No figures</p>'}</div>
    </div>
  </div>`;
}

/** Shown to everyone except the chooser during private card selection. */
function selectingWaitHtml(state: GamePublicState, myId: string): string {
  const t = state.targeting;
  if (!t || t.playerId === myId) return '';
  const lackSelecting = t.effect.kind === 'discard_from_hand' && (t.step ?? 0) === 1;
  const lateSelecting = t.effect.kind === 'late_arrival';
  if (!lackSelecting && !lateSelecting) return '';
  const who = state.players.find((p) => p.id === t.playerId)?.name ?? 'Player';
  return `<div class="hand-peek-overlay selecting-wait" id="selecting-wait" role="status">
    <div class="hand-peek-panel">
      <p>${escape(who)} is selecting a card</p>
    </div>
  </div>`;
}

function pileBrowserHtml(
  state: GamePublicState,
  myId: string,
  pileBrowse: 'action' | 'noble' | null,
): string {
  if (!pileBrowse) return '';
  const picking =
    pileBrowse === 'action' &&
    state.targeting?.playerId === myId &&
    state.targeting.effect.kind === 'from_discard';
  const title =
    pileBrowse === 'action'
      ? picking
        ? 'Leak Dump — take one action'
        : 'Action discard'
      : 'Figures discard';
  const cards =
    pileBrowse === 'action'
      ? [...(state.actionDiscard ?? [])]
          .reverse()
          .map((c) => actionCardHtml(c, { selectable: false }))
          .join('')
      : [...(state.nobleDiscard ?? [])]
          .reverse()
          .map((n) => nobleCardHtml(n, { houseRules: state.houseRules }))
          .join('');
  return `<div class="pile-browser" id="pile-browser" data-kind="${pileBrowse}">
    <div class="pile-browser-head">
      <h2>${title}</h2>
      ${picking ? '<p>Click a card to take it. Scroll-wheel to zoom.</p>' : '<p>Scroll-wheel to zoom. Click the backdrop or Close to leave.</p>'}
      ${picking ? '' : '<button type="button" id="pile-browser-close" class="ghost pile-browser-close">Close</button>'}
    </div>
    <div class="pile-browser-cards">${cards || '<p class="muted">Empty</p>'}</div>
  </div>`;
}

function playerPickEligible(
  state: GamePublicState,
  effect: ActionEffect,
  playerId: string,
  actorId: string,
): boolean {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return false;
  if (p.id === actorId) return false;
  if (effect.kind === 'place_clown') return true;
  if (effect.kind === 'discard_from_hand') return p.handCount > 0;
  if (effect.kind === 'discard_n_from_hand') return p.handCount >= effect.count;
  if (effect.kind === 'random_lose_noble' || effect.kind === 'missed' || effect.kind === 'clerical_error')
    return p.collected.length > 0;
  return true;
}

function playerPickDialog(state: GamePublicState, myId: string): string {
  const t = state.targeting;
  const clericalPick = t?.effect.kind === 'clerical_error' && t.step === 0;
  if (t?.effect.kind === 'discard_n_from_hand' && (t.step ?? 0) !== 0) return '';
  if (t?.effect.kind === 'discard_from_hand' && (t.step ?? 0) !== 0) return '';
  if (!t || (!PLAYER_PICK_KINDS.includes(t.effect.kind) && !clericalPick)) return '';
  const actor = state.players.find((p) => p.id === t.playerId);
  const chosen = t.picks[0];
  const chooser = t.playerId === myId && !chosen;
  const prompt =
    t.effect.kind === 'place_clown'
      ? `${actor?.name ?? 'Player'} — who gets Late Night?`
      : t.effect.kind === 'clerical_error'
        ? `${actor?.name ?? 'Player'} — whose score pile?`
        : t.effect.kind === 'discard_n_from_hand'
          ? `${actor?.name ?? 'Player'} — who discards ${t.effect.count} cards?`
          : t.effect.kind === 'discard_from_hand'
            ? `${actor?.name ?? 'Player'} — whose hand do you look at?`
            : `${actor?.name ?? 'Player'} — choose a player`;
  const seats = state.players
    .map((p, seat) => {
      const ok = playerPickEligible(state, t.effect, p.id, t.playerId);
      const cls = [
        'pick-seat',
        p.id === chosen ? 'chosen' : '',
        !ok ? 'ineligible' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<button type="button" class="${cls}" data-player="${p.id}" ${!ok || !chooser ? 'disabled' : ''}>
        <span class="avatar" style="--avatar:${playerColor(seat)}">${escape(p.name.slice(0, 1))}</span>
        <span class="pick-name">${escape(p.name)}</span>
      </button>`;
    })
    .join('');
  return `<div class="player-pick-overlay ${chosen ? 'has-choice' : ''}" id="player-pick">
    <div class="player-pick-panel">
      <p>${escape(prompt)}</p>
      <div class="player-pick-row">${seats}</div>
    </div>
  </div>`;
}

function turnLabel(state: GamePublicState, myId: string): string {
  if (state.phase === 'day_intro') return `Day ${state.day}`;
  if (state.phase === 'targeting') {
    const t = state.targeting;
    const who = state.players.find((p) => p.id === t?.playerId);
    if (who?.id === myId) {
      if (t?.effect.kind === 'discard_from_hand' && (t.step ?? 0) === 1) return 'Select a card to discard';
      if (t?.effect.kind === 'late_arrival') return 'Choose a figure for the line';
      return 'Choose targets';
    }
    if (
      (t?.effect.kind === 'discard_from_hand' && (t.step ?? 0) === 1) ||
      t?.effect.kind === 'late_arrival'
    ) {
      return `${who?.name ?? 'Player'} is selecting a card`;
    }
    return `${who?.name ?? 'Player'} is choosing…`;
  }
  const cur = state.players.find((p) => p.id === state.currentPlayerId);
  if (!cur) return '';
  return cur.id === myId ? 'Your turn — play or skip' : `${cur.name}'s turn`;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
