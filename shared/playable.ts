import { nobleById } from './cards.js';
import type { ActionEffect, GamePublicState } from './types.js';

export const PLAYER_TARGET_KINDS: ActionEffect['kind'][] = [
  'give_front_to_player',
  'skip_opponent_turn',
  'penalty',
  'front_penalty',
  'random_lose_noble',
  'swap_hands',
  'discard_from_hand',
  'discard_n_from_hand',
  'place_clown',
  'missed',
];

export function isPlayerTargetEffect(kind: ActionEffect['kind']): boolean {
  return PLAYER_TARGET_KINDS.includes(kind);
}

export function isLineAltering(effect: ActionEffect): boolean {
  const k = effect.kind;
  return [
    'move_forward',
    'move_forward_exact',
    'move_back',
    'move_back_exact_extra',
    'move_to_front',
    'move_to_back',
    'move_suit_forward',
    'move_suit_to_front',
    'move_named_to_front',
    'move_ability_to_front',
    'front_to_end',
    'reverse_line',
    'remove_from_line',
    'discard_and_replace',
    'rearrange_front_n',
    'randomize_front_n',
    'randomize_line',
    'escape',
    'redeal_line',
    'add_nobles_to_end',
    'late_arrival',
    'missed',
  ].includes(k);
}

export function frontBlocksActions(state: GamePublicState): boolean {
  const front = state.line[0];
  return !!front && nobleById(front.defId)?.ability === 'unpopular_judge';
}

/** Why this card cannot be played right now, or null if it can. */
export function actionPlayBlock(
  state: GamePublicState,
  effect: ActionEffect,
  actorId: string,
): string | null {
  if (state.actionLocked) return 'Rush Job: you cannot play an action this turn. Collect a figure instead.';
  if (frontBlocksActions(state)) {
    const name = nobleById(state.line[0].defId)?.name ?? 'This figure';
    return `${name} is at the front — no one may play an action. Collect instead.`;
  }
  if (state.callousActive && isLineAltering(effect)) {
    return 'Callous Guards block line-altering actions.';
  }
  if (!actionIsPlayable(state, effect, actorId)) {
    return 'That action has no legal play right now.';
  }
  return null;
}

/** Whether this action can legally resolve given the current line / table. */
export function actionIsPlayable(state: GamePublicState, effect: ActionEffect, actorId: string): boolean {
  const line = state.line;
  switch (effect.kind) {
    case 'move_forward_exact':
      return line.some((_, i) => i >= effect.n);
    case 'move_back_exact_extra':
      return line.some((_, i) => i + effect.n <= line.length - 1);
    case 'move_forward':
      return line.length > 1;
    case 'move_back':
      return line.length > 1;
    case 'move_suit_forward':
      return line.some((n, i) => i >= 1 && nobleById(n.defId)?.suit === effect.suit);
    case 'move_suit_to_front':
      return line.some((n) => nobleById(n.defId)?.suit === effect.suit);
    case 'move_ability_to_front':
      return line.some((n) => nobleById(n.defId)?.ability === effect.ability);
    case 'missed':
      return state.players.some((p) => p.id !== actorId && p.collected.length > 0);
    case 'from_discard':
      return (state.actionDiscard?.length ?? state.discardCount ?? 0) > 0;
    case 'clerical_error':
      return state.players.some((p) => p.id !== actorId && p.collected.length > 0);
    case 'discard_n_from_hand':
      return state.players.some((p) => p.id !== actorId && p.handCount >= effect.count);
    default:
      return true;
  }
}
