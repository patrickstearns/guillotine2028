import { actionById, nobleById } from './cards.js';
import { actionIsPlayable, isLineAltering, isPlayerTargetEffect } from './playable.js';
import type { GuillotineEngine } from './engine.js';
import type { ActionEffect, NobleInstance } from './types.js';

/** Points this player would gain from collecting a given noble right now. */
function collectValue(engine: GuillotineEngine, playerId: string, noble: NobleInstance): number {
  const def = nobleById(noble.defId);
  if (!def) return 0;
  if (def.ability === 'clown') return 1.2; // collect then dump on someone else
  const me = engine.getPublicState().players.find((p) => p.id === playerId);
  if (!me) return def.points;

  if (def.ability === 'palace_guard') {
    const ceos = me.collected.filter((c) => nobleById(c.defId)?.ability === 'palace_guard').length;
    // New total CEO score is (n+1)^2 vs n^2 → gain 2n+1
    return 2 * ceos + 1;
  }
  if (def.ability === 'tragic_figure') {
    const martyrs = me.collected.filter((c) => nobleById(c.defId)?.suit === 'martyr').length + 1;
    return -martyrs;
  }
  if (def.suit === 'martyr') {
    const indifferent = me.frontCards.some(
      (f) => actionById(f.defId)?.effect.kind === 'indifferent_public',
    );
    if (indifferent) return 1;
    return def.points;
  }
  let pts = def.points;
  if (def.ability === 'pair_count') {
    if (me.collected.some((c) => nobleById(c.defId)?.ability === 'pair_countess')) pts += 2;
  }
  if (def.ability === 'pair_countess') {
    if (me.collected.some((c) => nobleById(c.defId)?.ability === 'pair_count')) pts += 2;
  }
  // Fast noble / rival can chain — optimistic bonus
  if (def.ability === 'fast_noble' || def.ability === 'rival_executioner') pts += 1;
  if (def.ability === 'end_day' && !engine.getPublicState().houseRules.noPrematureEndings) pts += 0.5;
  return pts;
}

function pickRandom<T>(items: T[]): T | undefined {
  if (!items.length) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

/** Highest scoreOf; if several share the top value, pick one at random. */
function pickHighest<T>(items: T[], scoreOf: (item: T) => number): T | undefined {
  if (!items.length) return undefined;
  const top = Math.max(...items.map(scoreOf));
  return pickRandom(items.filter((item) => scoreOf(item) === top));
}

function isTaxDodge(n: NobleInstance): boolean {
  return nobleById(n.defId)?.ability === 'master_spy';
}

function afterSpyWalk(line: NobleInstance[]): NobleInstance[] {
  const spies = line.filter(isTaxDodge);
  if (!spies.length) return line;
  return [...line.filter((n) => !isTaxDodge(n)), ...spies];
}

/** Collect value of whoever is actually in front after an action (Tax Dodge walks to the end). */
function scoreLineAfterAction(
  engine: GuillotineEngine,
  playerId: string,
  line: NobleInstance[],
): number {
  const front = afterSpyWalk(line)[0];
  return front ? collectValue(engine, playerId, front) : 0;
}

function frontValue(engine: GuillotineEngine, playerId: string): number {
  const front = engine.getPublicState().line[0];
  if (!front) return 0;
  return collectValue(engine, playerId, front);
}

function simulateLineAfterMove(
  line: NobleInstance[],
  fromIndex: number,
  toIndex: number,
): NobleInstance[] {
  if (fromIndex < 0 || fromIndex >= line.length) return [...line];
  const next = [...line];
  const [card] = next.splice(fromIndex, 1);
  const clamped = Math.max(0, Math.min(next.length, toIndex));
  next.splice(clamped, 0, card);
  return next;
}

function lineWithMovedToFront(
  line: NobleInstance[],
  match: (n: NobleInstance) => boolean,
): NobleInstance[] {
  const i = line.findIndex(match);
  if (i < 0) return line;
  return simulateLineAfterMove(line, i, 0);
}

function bestTargets(
  engine: GuillotineEngine,
  playerId: string,
  effect: ActionEffect,
): { picks: string[]; expectedFront: number } {
  const state = engine.getPublicState();
  const line = state.line;
  const baseline = frontValue(engine, playerId);

  const scoreAfter = (nextLine: NobleInstance[]) =>
    scoreLineAfterAction(engine, playerId, nextLine);

  switch (effect.kind) {
    case 'move_forward':
    case 'move_forward_exact':
    case 'move_suit_forward': {
      let best = { picks: [] as string[], expectedFront: baseline };
      const max =
        effect.kind === 'move_forward_exact'
          ? effect.n
          : effect.max;
      line.forEach((n, i) => {
        if (isTaxDodge(n)) return;
        if (effect.kind === 'move_suit_forward' && nobleById(n.defId)?.suit !== effect.suit) return;
        if (effect.kind === 'move_forward_exact' && i < effect.n) return;
        const move = effect.kind === 'move_forward_exact' ? effect.n : Math.min(max, i);
        if (move <= 0) return;
        const next = simulateLineAfterMove(line, i, i - move);
        const v = scoreAfter(next);
        if (v > best.expectedFront) {
          best = { picks: [n.instanceId, String(move)], expectedFront: v };
        }
      });
      return best;
    }
    case 'move_back':
    case 'move_back_exact_extra': {
      let best = { picks: [] as string[], expectedFront: baseline };
      const nMove = effect.kind === 'move_back_exact_extra' ? effect.n : effect.max;
      if (effect.kind === 'move_back_exact_extra') {
        const i = 0;
        if (i + nMove > line.length - 1) return { picks: [], expectedFront: baseline };
      }
      if (line[0] && !isTaxDodge(line[0])) {
        const move = Math.min(nMove, line.length - 1);
        const next = simulateLineAfterMove(line, 0, move);
        const v = scoreAfter(next);
        if (v > baseline) {
          best = {
            picks: [line[0].instanceId, String(move)],
            expectedFront: v,
          };
        }
      }
      return best;
    }
    case 'move_to_front':
    case 'move_suit_to_front': {
      let best = { picks: [] as string[], expectedFront: baseline };
      line.forEach((n, i) => {
        if (isTaxDodge(n)) return;
        if (effect.kind === 'move_suit_to_front' && nobleById(n.defId)?.suit !== effect.suit) return;
        const next = simulateLineAfterMove(line, i, 0);
        const v = scoreAfter(next);
        if (v > best.expectedFront) best = { picks: [n.instanceId], expectedFront: v };
      });
      return best;
    }
    case 'move_ability_to_front': {
      let best = { picks: [] as string[], expectedFront: baseline };
      line.forEach((n, i) => {
        if (nobleById(n.defId)?.ability !== effect.ability) return;
        const next = simulateLineAfterMove(line, i, 0);
        const v = scoreAfter(next);
        if (v > best.expectedFront) best = { picks: [n.instanceId], expectedFront: v };
      });
      return best;
    }
    case 'remove_from_line':
    case 'discard_and_replace': {
      let best = { picks: [] as string[], expectedFront: baseline };
      line.forEach((n, i) => {
        const next = line.filter((_, j) => j !== i);
        const v = scoreAfter(next);
        if (v > best.expectedFront) {
          best = { picks: [n.instanceId], expectedFront: v };
        }
      });
      return best;
    }
    case 'rearrange_front_n': {
      const n = Math.min(effect.n, line.length);
      const window = line.slice(0, n);
      const spies = window.filter(isTaxDodge);
      const rest = window
        .filter((c) => !isTaxDodge(c))
        .sort((a, b) => collectValue(engine, playerId, b) - collectValue(engine, playerId, a));
      const ordered = [...rest, ...spies];
      const next = [...ordered, ...line.slice(n)];
      return {
        picks: ordered.map((c) => c.instanceId),
        expectedFront: scoreAfter(next),
      };
    }
    case 'place_clown': {
      const dump = pickHighest(
        state.players.filter((p) => p.id !== playerId),
        (p) => p.score,
      );
      return { picks: dump ? [dump.id] : [], expectedFront: scoreAfter(line) };
    }
    case 'missed': {
      const other = pickHighest(
        state.players.filter((p) => p.id !== playerId && p.collected.length > 0),
        (p) => p.score,
      );
      return {
        picks: other ? [other.id] : [],
        expectedFront: scoreAfter(line) + (other ? 0.8 : 0),
      };
    }
    case 'give_front_to_player': {
      if (baseline >= 0) return { picks: [], expectedFront: baseline };
      const other = pickRandom(state.players.filter((p) => p.id !== playerId));
      if (!other) return { picks: [], expectedFront: baseline };
      const next = line.slice(1);
      return { picks: [other.id], expectedFront: scoreAfter(next) + 0.1 };
    }
    case 'skip_opponent_turn':
    case 'penalty':
    case 'front_penalty':
    case 'random_lose_noble':
    case 'swap_hands': {
      const other = pickHighest(
        state.players.filter((p) => p.id !== playerId),
        (p) => p.score,
      );
      return {
        picks: other ? [other.id] : [],
        expectedFront: scoreAfter(line) + (other ? 0.5 : 0),
      };
    }
    case 'front_to_end':
    case 'from_discard': {
      const pile = state.actionDiscard ?? [];
      const pick = pile[pile.length - 1];
      return { picks: pick ? [pick.instanceId] : [], expectedFront: scoreAfter(line) + 0.35 };
    }
    case 'clerical_error': {
      const victim = pickHighest(
        state.players.filter((p) => p.id !== playerId && p.collected.length),
        (p) => p.score,
      );
      if (!victim) return { picks: [], expectedFront: baseline };
      const best = [...victim.collected].sort(
        (a, b) => collectValue(engine, playerId, b) - collectValue(engine, playerId, a),
      )[0];
      return {
        picks: best ? [victim.id, best.instanceId] : [victim.id],
        expectedFront: scoreAfter(line) + (best ? collectValue(engine, playerId, best) : 0),
      };
    }
    case 'discard_n_from_hand': {
      const other = pickHighest(
        state.players.filter((p) => p.id !== playerId && p.handCount >= effect.count),
        (p) => p.handCount,
      );
      return {
        picks: other ? [other.id] : [],
        expectedFront: scoreAfter(line) + (other ? 0.4 : 0),
      };
    }
    case 'discard_from_hand': {
      const other = pickHighest(
        state.players.filter((p) => p.id !== playerId && p.handCount > 0),
        (p) => p.handCount,
      );
      return {
        picks: other ? [other.id] : [],
        expectedFront: scoreAfter(line) + (other ? 0.5 : 0),
      };
    }
    case 'late_arrival': {
      const peek = engine.getPrivateHand(playerId).peekNobles?.cards ?? [];
      if (!peek.length) return { picks: [], expectedFront: scoreAfter(line) + 0.15 };
      const best = [...peek].sort(
        (a, b) => collectValue(engine, playerId, b) - collectValue(engine, playerId, a),
      )[0];
      return {
        picks: best ? [best.instanceId] : [],
        expectedFront: scoreAfter(line) + 0.15,
      };
    }
    default:
      return { picks: [], expectedFront: scoreAfter(line) };
  }
}

function needsTarget(effect: ActionEffect): boolean {
  switch (effect.kind) {
    case 'reverse_line':
    case 'front_to_end':
    case 'randomize_front_n':
    case 'randomize_line':
    case 'escape':
    case 'redeal_line':
    case 'add_nobles_to_end':
    case 'collect_extra_front':
    case 'draw_skip_collect':
    case 'rain_delay':
    case 'callous_guards':
    case 'all_discard_random':
    case 'support_suit':
    case 'indifferent_public':
    case 'fountain_of_blood':
    case 'foreign_support':
    case 'end_day_after_turn':
    case 'move_named_to_front':
      return false;
    default:
      return true;
  }
}

function immediateGain(effect: ActionEffect, frontPts: number): number {
  switch (effect.kind) {
    case 'collect_extra_front':
      return 0;
    case 'fountain_of_blood':
      return 2;
    case 'support_suit':
      return 1.5;
    case 'foreign_support':
      return 1;
    case 'indifferent_public':
      return 1;
    case 'draw_skip_collect':
      return frontPts < 0 ? 2 : -1; // skip collect if front is bad
    case 'front_to_end':
    case 'reverse_line':
    case 'move_named_to_front':
    case 'move_ability_to_front':
      return 0;
    case 'end_day_after_turn':
      return frontPts < 0 ? 2 : -1;
    case 'add_nobles_to_end':
      return 0.2;
    default:
      return 0;
  }
}

/**
 * AI: maximize expected score from collecting this turn (after optional action).
 */
export function aiTakeTurn(engine: GuillotineEngine): void {
  const state = engine.getPublicState();
  if (state.phase === 'targeting') {
    resolveTargeting(engine);
    return;
  }
  if (state.phase !== 'action' || !state.currentPlayerId) return;
  const me = state.players.find((p) => p.id === state.currentPlayerId);
  if (!me?.isAi) return;

  // Unpopular judge or Rush Job: collect only
  if (
    state.actionLocked ||
    (state.line[0] && nobleById(state.line[0].defId)?.ability === 'unpopular_judge')
  ) {
    engine.skipAction(me.id);
    return;
  }

  const skipScore = frontValue(engine, me.id);
  let best: { cardId: string; score: number; picks?: string[] } = {
    cardId: '',
    score: skipScore,
  };

  const hand = engine.getPrivateHand(me.id).hand;
  for (const card of hand) {
    const def = actionById(card.defId);
    if (!def) continue;
    if (state.callousActive && isLineAltering(def.effect)) continue;
    if (!actionIsPlayable(state, def.effect, me.id)) continue;

    if (needsTarget(def.effect)) {
      const { picks, expectedFront } = bestTargets(engine, me.id, def.effect);
      if (!picks.length && def.effect.kind !== 'from_discard') continue;
      if (expectedFront > best.score) best = { cardId: card.instanceId, score: expectedFront, picks };
    } else if (def.effect.kind === 'collect_extra_front') {
      const walked = afterSpyWalk(state.line);
      const first = walked[0] ? collectValue(engine, me.id, walked[0]) : 0;
      const second = walked[1] ? collectValue(engine, me.id, walked[1]) : 0;
      const score = first + second;
      if (score > best.score) best = { cardId: card.instanceId, score };
    } else {
      let nextLine = state.line;
      const effect = def.effect;
      if (effect.kind === 'front_to_end' && state.line.length) {
        nextLine = [...state.line.slice(1), state.line[0]];
      } else if (effect.kind === 'reverse_line') {
        nextLine = [...state.line].reverse();
      } else if (effect.kind === 'move_named_to_front') {
        const nobleId = effect.nobleId;
        nextLine = lineWithMovedToFront(
          state.line,
          (n) =>
            n.defId === nobleId ||
            n.defId.startsWith(nobleId) ||
            nobleById(n.defId)?.id.replace(/_\d+$/, '') === nobleId,
        );
      } else if (effect.kind === 'move_ability_to_front') {
        if (effect.ability === 'master_spy') continue;
        const ability = effect.ability;
        nextLine = lineWithMovedToFront(
          state.line,
          (n) => nobleById(n.defId)?.ability === ability,
        );
      }
      const expectedFront =
        effect.kind === 'draw_skip_collect' ? 0 : scoreLineAfterAction(engine, me.id, nextLine);
      const score = expectedFront + immediateGain(effect, skipScore);
      if (score > best.score) best = { cardId: card.instanceId, score };
    }
  }

  if (!best.cardId) {
    engine.skipAction(me.id);
    return;
  }

  const played = engine.playCard(me.id, best.cardId);
  if (!played.ok) {
    engine.skipAction(me.id);
    return;
  }

  if (engine.getPublicState().phase === 'targeting') {
    const t = engine.getPublicState().targeting;
    if (t && isPlayerTargetEffect(t.effect.kind)) {
      const picks = best.picks?.length ? best.picks : bestTargets(engine, me.id, t.effect).picks;
      if (picks.length && !t.picks.length) {
        engine.previewTargets(me.id, picks);
        return;
      }
      if (t.picks.length) {
        const res = engine.submitTargets(me.id, t.picks);
        if (!res.ok) resolveTargeting(engine);
      } else {
        resolveTargeting(engine);
      }
      return;
    }
    if (best.picks?.length) {
      const res = engine.submitTargets(me.id, best.picks);
      if (!res.ok) resolveTargeting(engine);
    } else {
      resolveTargeting(engine);
    }
  }
}

function resolveTargeting(engine: GuillotineEngine): void {
  const state = engine.getPublicState();
  const t = state.targeting;
  if (!t) return;
  const me = state.players.find((p) => p.id === t.playerId);
  if (!me?.isAi) return;

  const { picks } = bestTargets(engine, me.id, t.effect);
  if (t.effect.kind === 'discard_n_from_hand' && 'count' in t.effect) {
    if ((t.step ?? 0) === 0) {
      const victimId = picks[0];
      if (t.picks.length) engine.submitTargets(me.id, t.picks);
      else if (victimId) engine.previewTargets(me.id, [victimId]);
      return;
    }
    const hand = engine.getPrivateHand(me.id).hand;
    engine.submitTargets(
      me.id,
      hand.slice(0, t.effect.count).map((c) => c.instanceId),
    );
    return;
  }
  if (t.effect.kind === 'discard_from_hand') {
    if ((t.step ?? 0) === 0) {
      const victimId = picks[0];
      if (t.picks.length) engine.submitTargets(me.id, t.picks);
      else if (victimId) engine.previewTargets(me.id, [victimId]);
      return;
    }
    const peek = engine.getPrivateHand(me.id).peekHand?.cards ?? [];
    const dump = pickRandom(peek);
    if (dump) engine.submitTargets(me.id, [t.picks[0], dump.instanceId]);
    return;
  }
  if (t.effect.kind === 'late_arrival') {
    const peek = engine.getPrivateHand(me.id).peekNobles?.cards ?? [];
    const best = [...peek].sort(
      (a, b) => collectValue(engine, me.id, b) - collectValue(engine, me.id, a),
    )[0];
    if (best) engine.submitTargets(me.id, [best.instanceId]);
    return;
  }
  if (t.effect.kind === 'clerical_error') {
    if (t.step === 0) {
      const victimId = picks[0];
      if (t.picks.length) engine.submitTargets(me.id, t.picks);
      else if (victimId) engine.previewTargets(me.id, [victimId]);
      return;
    }
    if (t.step === 1) {
      const victim = state.players.find((p) => p.id === t.picks[0]);
      const best = victim
        ? [...victim.collected].sort(
            (a, b) => collectValue(engine, me.id, b) - collectValue(engine, me.id, a),
          )[0]
        : null;
      if (best) engine.submitTargets(me.id, [t.picks[0], best.instanceId]);
      return;
    }
    if (t.step === 2) {
      const actor = state.players.find((p) => p.id === state.currentPlayerId);
      const stolen = t.picks[1];
      const best = actor
        ? [...actor.collected]
            .filter((c) => c.instanceId !== stolen)
            .sort((a, b) => collectValue(engine, me.id, b) - collectValue(engine, me.id, a))[0]
        : null;
      if (best) engine.submitTargets(me.id, [best.instanceId]);
      return;
    }
  }
  if (isPlayerTargetEffect(t.effect.kind)) {
    if (t.picks.length) {
      engine.submitTargets(me.id, t.picks);
      return;
    }
    const chosen = picks.length ? picks : [pickRandom(state.players.filter((p) => p.id !== me.id))?.id].filter(Boolean) as string[];
    if (chosen.length) engine.previewTargets(me.id, chosen);
    return;
  }
  let res = engine.submitTargets(me.id, picks);
  if (!res.ok) {
    // Fallbacks
    if (state.line[0]) {
      res = engine.submitTargets(me.id, [state.line[0].instanceId, '1']);
    }
  }
  if (!res.ok) {
    // Last resort: try empty / any player
    const other = pickRandom(state.players.filter((p) => p.id !== me.id));
    if (other) engine.submitTargets(me.id, [other.id]);
  }
  // If still stuck in targeting, force skip by submitting something that clears —
  // engine may still be stuck; pumpAi will retry a few times then give up for this tick
}

/** Run AI until a human must act, game ends, or step budget exhausted. */
export function pumpAi(engine: GuillotineEngine, maxSteps = 60): void {
  for (let i = 0; i < maxSteps; i++) {
    const s = engine.getPublicState();
    if (s.phase === 'results' || s.phase === 'waiting' || s.phase === 'between_days' || s.phase === 'day_intro' || s.phase === 'resolving') return;

    if (s.phase === 'targeting') {
      const p = s.players.find((x) => x.id === s.targeting?.playerId);
      if (!p?.isAi) return;
      if (
        s.targeting &&
        isPlayerTargetEffect(s.targeting.effect.kind) &&
        s.targeting.picks.length &&
        !(s.targeting.effect.kind === 'discard_n_from_hand' && (s.targeting.step ?? 0) === 1) &&
        !(s.targeting.effect.kind === 'discard_from_hand' && (s.targeting.step ?? 0) === 1)
      ) {
        const submitted = engine.submitTargets(p.id, s.targeting.picks);
        if (!submitted.ok && s.targeting.effect.kind === 'place_clown') {
          const other = pickRandom(s.players.filter((x) => x.id !== p.id));
          if (other) engine.submitTargets(p.id, [other.id]);
        }
        continue;
      }
      const before = s.targeting?.cardInstanceId;
      resolveTargeting(engine);
      const after = engine.getPublicState();
      // Multi-step / player-pick preview: pause so the next timer tick can show the choice.
      if (
        after.phase === 'targeting' &&
        after.targeting?.picks.length &&
        after.targeting.effect &&
        isPlayerTargetEffect(after.targeting.effect.kind)
      ) {
        return;
      }
      if (after.phase === 'targeting' && after.targeting?.cardInstanceId === before) {
        // Truly stuck with no preview — last-ditch dump for Late Night, then bail this tick.
        if (after.targeting?.effect.kind === 'place_clown' && !after.targeting.picks.length) {
          const other = pickRandom(after.players.filter((x) => x.id !== p.id));
          if (other) engine.submitTargets(p.id, [other.id]);
        }
        return;
      }
      continue;
    }

    if (s.phase !== 'action' || !s.currentPlayerId) return;
    const cur = s.players.find((p) => p.id === s.currentPlayerId);
    if (!cur?.isAi) return;

    const beforePlayer = s.currentPlayerId;
    const beforeDay = s.day;
    const beforeLine = s.line.length;
    aiTakeTurn(engine);
    const after = engine.getPublicState();
    // Progress check
    if (
      after.currentPlayerId === beforePlayer &&
      after.phase === 'action' &&
      after.day === beforeDay &&
      after.line.length === beforeLine &&
      after.actionsRemaining === s.actionsRemaining
    ) {
      // No progress — force skip
      engine.skipAction(cur.id);
    }
  }
}

/** True if an AI currently needs to act. */
export function aiShouldAct(engine: GuillotineEngine): boolean {
  const s = engine.getPublicState();
  if (s.phase === 'targeting') {
    if (!s.targeting) return false;
    return !!s.players.find((p) => p.id === s.targeting?.playerId)?.isAi;
  }
  if (s.phase !== 'action' || !s.currentPlayerId) return false;
  return !!s.players.find((p) => p.id === s.currentPlayerId)?.isAi;
}
