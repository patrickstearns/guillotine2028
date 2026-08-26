/** Shared types for Guillotine 2028 */

export type Suit = 'judicial' | 'executive' | 'legislative' | 'media' | 'martyr';

export type NobleAbility =
  | 'none'
  | 'end_day' // Robespierre / DeSantis
  | 'pair_count' // Count / Ladybug — +2 if have countess
  | 'pair_countess' // Countess / Space Laser — +2 if have count
  | 'fast_noble' // collect another from front
  | 'draw_action'
  | 'unpopular_judge' // no actions while at front
  | 'rival_executioner' // also collect top of noble deck
  | 'add_noble_to_end'
  | 'master_spy' // move to end when action played
  | 'palace_guard' // CEO — score = count of CEOs
  | 'clown' // place in another's pile
  | 'innocent_victim' // discard an action
  | 'tragic_figure'; // −1 per martyr in pile

export interface NobleDef {
  id: string;
  name: string; // moniker shown on card
  realName: string; // art reference only
  suit: Suit;
  points: number;
  ability: NobleAbility;
  blurb: string;
  copies?: number;
}

export type ActionEffect =
  | { kind: 'move_forward'; max: number }
  | { kind: 'move_forward_exact'; n: number }
  | { kind: 'move_back'; max: number }
  | { kind: 'move_back_exact_extra'; n: number }
  | { kind: 'move_to_front' }
  | { kind: 'move_to_back' }
  | { kind: 'move_suit_forward'; suit: Suit; max: number }
  | { kind: 'move_suit_to_front'; suit: Suit }
  | { kind: 'move_named_to_front'; nobleId: string }
  | { kind: 'move_ability_to_front'; ability: NobleAbility }
  | { kind: 'front_to_end' }
  | { kind: 'reverse_line' }
  | { kind: 'remove_from_line' }
  | { kind: 'discard_and_replace' }
  | { kind: 'rearrange_front_n'; n: number }
  | { kind: 'randomize_front_n'; n: number }
  | { kind: 'randomize_line' }
  | { kind: 'escape' }
  | { kind: 'redeal_line' }
  | { kind: 'add_nobles_to_end'; count: number }
  | { kind: 'late_arrival' }
  | { kind: 'collect_extra_front' }
  | { kind: 'give_front_to_player' }
  | { kind: 'from_discard' }
  | { kind: 'draw_skip_collect'; count: number }
  | { kind: 'rain_delay' }
  | { kind: 'callous_guards' }
  | { kind: 'random_lose_noble' }
  | { kind: 'missed' }
  | { kind: 'penalty'; amount: number }
  | { kind: 'front_penalty'; amount: number }
  | { kind: 'discard_front_card' }
  | { kind: 'skip_opponent_turn' }
  | { kind: 'clerical_error' }
  | { kind: 'discard_from_hand' }
  | { kind: 'all_discard_random' }
  | { kind: 'discard_n_from_hand'; count: number }
  | { kind: 'swap_hands' }
  | { kind: 'support_suit'; suit: Suit }
  | { kind: 'indifferent_public' }
  | { kind: 'fountain_of_blood' }
  | { kind: 'foreign_support' }
  | { kind: 'place_clown' }
  | { kind: 'end_day_after_turn' };

export interface ActionDef {
  id: string;
  name: string;
  text: string;
  effect: ActionEffect;
  copies?: number;
  art?: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isAi: boolean;
  connected: boolean;
  score: number;
  handCount: number;
  collected: NobleInstance[];
  frontCards: FrontCardInstance[];
  penalties: number;
  skipActionThisTurn?: boolean;
}

export interface NobleInstance {
  instanceId: string;
  defId: string;
  dayCollected?: number;
}

export interface FrontCardInstance {
  instanceId: string;
  defId: string;
  dayPlayed: number;
}

export interface ActionInstance {
  instanceId: string;
  defId: string;
}

export type Phase =
  | 'waiting'
  | 'dealing'
  | 'action'
  | 'targeting'
  | 'collect'
  | 'resolving'
  | 'revealing'
  | 'post_collect'
  | 'between_days'
  | 'day_intro'
  | 'results';

export interface TargetingState {
  playerId: string;
  cardInstanceId: string;
  effect: ActionEffect;
  step: number;
  picks: string[];
}

export interface GamePublicState {
  roomId: string;
  phase: Phase;
  day: number;
  line: NobleInstance[];
  players: PublicPlayer[];
  currentPlayerId: string | null;
  actionsRemaining: number;
  targeting: TargetingState | null;
  toast: string | null;
  log: string[];
  houseRules: HouseRules;
  hostId: string;
  maxPlayers: number;
  started: boolean;
  dayCollectedCounts: Record<string, number>;
  callousActive: boolean;
  endDayAfterTurn: boolean;
  skipCollectThisTurn: boolean;
  actionLocked: boolean;
  actionDeckCount: number;
  discardCount: number;
  discardTopDefId: string | null;
  actionDiscard: ActionInstance[];
  nobleDeckCount: number;
  nobleDiscardCount: number;
  nobleDiscardTopDefId: string | null;
  nobleDiscard: NobleInstance[];
  revealedPlay: { playerId: string; defId: string; instanceId: string } | null;
  anims: AnimEvent[];
}

export type AnimEvent =
  | { type: 'draw_action'; playerId: string; instanceId: string; defId: string }
  | { type: 'discard_action'; playerId: string; defId: string; instanceId?: string }
  | { type: 'collect_noble'; playerId: string; instanceId: string; defId: string; fromDeck?: boolean }
  | { type: 'deal_noble'; instanceId: string; defId: string }
  | { type: 'discard_noble'; instanceId: string; defId: string; playerId?: string }
  | { type: 'return_to_deck'; instanceId: string; defId: string }
  | { type: 'reveal_action'; playerId: string; defId: string; instanceId: string }
  | { type: 'play_front'; playerId: string; defId: string; instanceId: string }
  | { type: 'line_walk'; instanceId: string; defId: string; fromFront?: boolean };

export interface HouseRules {
  label: string;
  notes: string;
  /** Dev: deal unique action kinds to the human in cycle order. */
  catalogDeal?: boolean;
  /** Miller cannot end the day; Spoilsport is removed from the deck. */
  noPrematureEndings?: boolean;
}

export interface PrivateHand {
  hand: ActionInstance[];
  /** Lack of Support: victim hand visible only to the chooser. */
  peekHand?: { ownerId: string; ownerName: string; cards: ActionInstance[] } | null;
}

export interface LobbyPlayer {
  id: string;
  name: string;
}

export interface LobbyGameSummary {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  started: boolean;
  houseRulesLabel: string;
  /** Disconnected seats that can be reclaimed by matching name. */
  rejoinNames: string[];
}

export interface DayBreakdown {
  day: number;
  bySuit: Record<Suit, { count: number; points: number }>;
  fountainBonus: number;
  supportBonus: number;
  total: number;
}

export interface ScoreLine {
  kind: 'noble' | 'action' | 'penalty';
  defId?: string;
  instanceId?: string;
  label: string;
  points: number;
}

export interface PlayerResult {
  playerId: string;
  name: string;
  isAi: boolean;
  days: DayBreakdown[];
  tally: ScoreLine[];
  finalScore: number;
}
