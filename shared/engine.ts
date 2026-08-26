import { ACTIONS, actionById, expandActions, expandNobles, nobleById } from './cards.js';
import { pickAiName } from './aiNames.js';
import { actionIsPlayable, isLineAltering, isPlayerTargetEffect } from './playable.js';
import type {
  ActionEffect,
  ActionInstance,
  FrontCardInstance,
  GamePublicState,
  HouseRules,
  NobleAbility,
  NobleInstance,
  Phase,
  PlayerResult,
  PrivateHand,
  PublicPlayer,
  ScoreLine,
  Suit,
  TargetingState,
} from './types.js';

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function uid(): string {
  return `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
}

interface InternalPlayer {
  id: string;
  name: string;
  isAi: boolean;
  connected: boolean;
  hand: ActionInstance[];
  collected: NobleInstance[];
  frontCards: FrontCardInstance[];
  skipNextTurn: boolean;
  penalties: number;
}

export class GuillotineEngine {
  roomId: string;
  hostId: string;
  maxPlayers: number;
  houseRules: HouseRules;
  started = false;
  phase: Phase = 'waiting';
  day = 0;
  players: InternalPlayer[] = [];
  line: NobleInstance[] = [];
  nobleDeck: NobleInstance[] = [];
  actionDeck: ActionInstance[] = [];
  actionDiscard: ActionInstance[] = [];
  nobleDiscard: NobleInstance[] = [];
  pendingReveal: { playerId: string; card: ActionInstance; effect: ActionEffect } | null = null;
  currentPlayerId: string | null = null;
  actionsRemaining = 1;
  targeting: TargetingState | null = null;
  toast: string | null = null;
  log: string[] = [];
  dayCollectedCounts: Record<string, number> = {};
  /** Seat index in `players` who opens the current day. */
  dayStarterIndex = 0;
  pendingExtraCollect = false;
  endDayAfterTurn = false;
  skipCollectThisTurn = false;
  actionLocked = false;
  private endDayFromNoble = false;
  results: PlayerResult[] | null = null;
  lineSize = 12;
  pendingAnims: import('./types.js').AnimEvent[] = [];
  private collectPaused: 'after_first' | 'after_extra' | null = null;
  private pendingClownCard: NobleInstance | null = null;
  private pendingFrontCard: ActionInstance | null = null;

  private catalogDeal = false;
  private catalogPlayerId: string | null = null;
  private catalogOrder: string[] = [];
  private catalogIndex = 0;

  constructor(roomId: string, hostId: string, maxPlayers = 5, houseRules?: HouseRules) {
    this.roomId = roomId;
    this.hostId = hostId;
    this.maxPlayers = Math.min(5, Math.max(1, maxPlayers));
    this.houseRules = houseRules ?? {
      label: 'Standard',
      notes: 'House rules placeholder — no modifiers yet.',
    };
  }

  addPlayer(id: string, name: string, isAi = false): boolean {
    if (this.started) return false;
    if (this.players.length >= this.maxPlayers) return false;
    if (this.players.some((p) => p.id === id)) return false;
    this.players.push({
      id,
      name,
      isAi,
      connected: !isAi,
      hand: [],
      collected: [],
      frontCards: [],
      skipNextTurn: false,
      penalties: 0,
    });
    return true;
  }

  removePlayer(id: string): void {
    if (this.started) {
      const p = this.players.find((x) => x.id === id);
      if (p) p.connected = false;
      return;
    }
    this.players = this.players.filter((p) => p.id !== id);
  }

  setConnected(id: string, connected: boolean): void {
    const p = this.players.find((x) => x.id === id);
    if (p) p.connected = connected;
  }

  /** Turn a human seat into AI (AFK drop) or restore a reclaiming human. */
  setPlayerAi(id: string, isAi: boolean): void {
    const p = this.players.find((x) => x.id === id);
    if (!p) return;
    p.isAi = isAi;
    if (isAi) p.connected = false;
  }

  addAiPlayers(count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.players.length >= this.maxPlayers) break;
      const name = pickAiName(this.players.map((p) => p.name));
      this.addPlayer(`ai_${uid().slice(0, 8)}`, name, true);
    }
  }

  private pushLog(msg: string): void {
    this.log.unshift(msg);
    if (this.log.length > 40) this.log.length = 40;
  }

  /** Public log + optional toast helper for server events (AFK drop, etc.). */
  announce(msg: string, toast = false): void {
    this.pushLog(msg);
    if (toast) this.toast = msg;
  }

  private callousActive(): boolean {
    return this.players.some((p) =>
      p.frontCards.some((f) => actionById(f.defId)?.effect.kind === 'callous_guards'),
    );
  }

  start(): { ok: boolean; error?: string } {
    if (this.started) return { ok: false, error: 'Already started' };
    if (this.players.length < 1) return { ok: false, error: 'Need at least 1 player' };

    this.started = true;
    this.catalogDeal = !!this.houseRules.catalogDeal;
    this.catalogPlayerId = this.catalogDeal
      ? (this.players.find((p) => !p.isAi)?.id ?? null)
      : null;
    this.catalogOrder = this.catalogDeal ? ACTIONS.map((a) => a.id) : [];
    this.catalogIndex = 0;
    this.toast = 'Shuffling decks…';
    this.nobleDeck = shuffle(expandNobles().map((n) => ({ instanceId: uid(), defId: n.id })));
    const actionDefs = expandActions().filter(
      (a) => !(this.houseRules.noPrematureEndings && a.id === 'spoilsport'),
    );
    this.actionDeck = shuffle(actionDefs.map((a) => ({ instanceId: uid(), defId: a.id })));
    this.actionDiscard = [];
    this.nobleDiscard = [];
    this.pendingReveal = null;
    for (const p of this.players) {
      p.hand = [];
      p.collected = [];
      p.frontCards = [];
      p.skipNextTurn = false;
      p.penalties = 0;
    }
    this.beginDay(1);
    return { ok: true };
  }

  private drawAction(): ActionInstance | null {
    if (!this.actionDeck.length) {
      if (!this.actionDiscard.length) return null;
      this.actionDeck = shuffle(this.actionDiscard);
      this.actionDiscard = [];
    }
    return this.actionDeck.pop() ?? null;
  }

  private drawActionFor(player: InternalPlayer): ActionInstance | null {
    if (this.catalogDeal && this.catalogPlayerId === player.id && this.catalogOrder.length) {
      if (this.catalogIndex >= this.catalogOrder.length) this.catalogIndex = 0;
      const defId = this.catalogOrder[this.catalogIndex]!;
      this.catalogIndex += 1;
      return { instanceId: uid(), defId };
    }
    return this.drawAction();
  }

  private giveAction(player: InternalPlayer, card: ActionInstance | null): void {
    if (!card) return;
    player.hand.push(card);
    this.pendingAnims.push({ type: 'draw_action', playerId: player.id, instanceId: card.instanceId, defId: card.defId });
  }

  private discardFrom(playerId: string, cards: ActionInstance[]): void {
    for (const card of cards) {
      this.actionDiscard.push(card);
      this.pendingAnims.push({ type: 'discard_action', playerId, defId: card.defId, instanceId: card.instanceId });
    }
  }

  takeAnimEvents(): import('./types.js').AnimEvent[] {
    const ev = this.pendingAnims;
    this.pendingAnims = [];
    return ev;
  }

  private discardNobles(cards: NobleInstance[], fromPlayerId?: string): void {
    for (const card of cards) {
      this.nobleDiscard.push(card);
      this.pendingAnims.push({
        type: 'discard_noble',
        instanceId: card.instanceId,
        defId: card.defId,
        playerId: fromPlayerId,
      });
    }
  }

  private dealNobleToLine(card: NobleInstance): void {
    this.line.push(card);
    this.pendingAnims.push({ type: 'deal_noble', instanceId: card.instanceId, defId: card.defId });
  }

  private dealHands(): void {
    for (const p of this.players) {
      while (p.hand.length < 5) {
        const c = this.drawActionFor(p);
        if (!c) break;
        this.giveAction(p, c);
      }
    }
  }

  private beginDay(day: number): void {
    this.day = day;
    this.toast = `Day ${day}`;
    this.endDayAfterTurn = false;
    this.endDayFromNoble = false;
    this.skipCollectThisTurn = false;
    this.dayCollectedCounts = Object.fromEntries(this.players.map((p) => [p.id, 0]));
    // Persistent support cards stay; day-only don't apply here — classic support lasts all game
    const dealCount = Math.min(this.lineSize, this.nobleDeck.length);
    this.line = [];
    for (let i = 0; i < dealCount; i++) {
      const n = this.nobleDeck.pop();
      if (n) {
        this.line.push(n);
        this.pendingAnims.push({ type: 'deal_noble', instanceId: n.instanceId, defId: n.defId });
      }
    }
    if (day === 1) {
      this.dealHands();
      this.dayStarterIndex = Math.floor(Math.random() * this.players.length);
    } else {
      const endedIdx = this.players.findIndex((p) => p.id === this.currentPlayerId);
      this.dayStarterIndex =
        endedIdx >= 0 ? (endedIdx + 1) % this.players.length : 0;
    }
    this.currentPlayerId = this.players[this.dayStarterIndex]!.id;
    this.actionsRemaining = 0;
    this.actionLocked = false;
    this.targeting = null;
    this.pendingExtraCollect = false;
    this.phase = 'day_intro';
    this.pushLog(`Day ${day} begins.`);
  }

  startDayPlay(): { ok: boolean; error?: string } {
    if (this.phase !== 'day_intro') return { ok: false, error: 'Not day intro' };
    this.toast = null;
    this.phase = 'action';
    this.actionsRemaining = 1;
    const starter = this.players.find((p) => p.id === this.currentPlayerId);
    if (starter) this.pushLog(`${starter.name} goes first.`);
    return { ok: true };
  }

  getPublicState(): GamePublicState {
    return {
      roomId: this.roomId,
      phase: this.phase,
      day: this.day,
      line: this.line,
      players: this.players.map((p) => this.toPublic(p)),
      currentPlayerId: this.currentPlayerId,
      actionsRemaining: this.actionsRemaining,
      targeting: this.targeting,
      toast: this.toast,
      log: this.log,
      houseRules: this.houseRules,
      hostId: this.hostId,
      maxPlayers: this.maxPlayers,
      started: this.started,
      dayCollectedCounts: { ...this.dayCollectedCounts },
      callousActive: this.callousActive(),
      endDayAfterTurn: this.endDayAfterTurn,
      skipCollectThisTurn: this.skipCollectThisTurn,
      actionLocked: this.actionLocked,
      actionDeckCount: this.actionDeck.length,
      discardCount: this.actionDiscard.length,
      discardTopDefId: this.actionDiscard[this.actionDiscard.length - 1]?.defId ?? null,
      actionDiscard: [...this.actionDiscard],
      nobleDeckCount: this.nobleDeck.length,
      nobleDiscardCount: this.nobleDiscard.length,
      nobleDiscardTopDefId: this.nobleDiscard[this.nobleDiscard.length - 1]?.defId ?? null,
      nobleDiscard: [...this.nobleDiscard],
      revealedPlay: this.pendingReveal
        ? {
            playerId: this.pendingReveal.playerId,
            defId: this.pendingReveal.card.defId,
            instanceId: this.pendingReveal.card.instanceId,
          }
        : this.pendingFrontCard && this.targeting
          ? {
              playerId: this.targeting.playerId,
              defId: this.pendingFrontCard.defId,
              instanceId: this.pendingFrontCard.instanceId,
            }
          : null,
      anims: [...this.pendingAnims],
    };
  }

  private toPublic(p: InternalPlayer): PublicPlayer {
    return {
      id: p.id,
      name: p.name,
      isAi: p.isAi,
      connected: p.connected,
      score: this.scorePlayer(p),
      handCount: p.hand.length,
      collected: p.collected,
      frontCards: p.frontCards,
      penalties: p.penalties,
      skipActionThisTurn: this.actionLocked && this.currentPlayerId === p.id,
    };
  }

  getPrivateHand(playerId: string): PrivateHand {
    const p = this.players.find((x) => x.id === playerId);
    const result: PrivateHand = { hand: p ? [...p.hand] : [] };
    const t = this.targeting;
    if (
      t?.effect.kind === 'discard_from_hand' &&
      (t.step ?? 0) === 1 &&
      t.playerId === playerId &&
      t.picks[0]
    ) {
      const victim = this.players.find((x) => x.id === t.picks[0]);
      if (victim) {
        result.peekHand = {
          ownerId: victim.id,
          ownerName: victim.name,
          cards: [...victim.hand],
        };
      }
    }
    return result;
  }

  scorePlayer(p: InternalPlayer): number {
    let score = 0;
    const indifferent = p.frontCards.some(
      (f) => actionById(f.defId)?.effect.kind === 'indifferent_public',
    );
    let ceoCount = 0;
    for (const c of p.collected) {
      const def = nobleById(c.defId);
      if (!def) continue;
      if (def.ability === 'palace_guard') ceoCount += 1;
    }
    for (const c of p.collected) {
      const def = nobleById(c.defId);
      if (!def) continue;
      if (def.ability === 'palace_guard') {
        score += ceoCount;
        continue;
      }
      if (def.suit === 'martyr' && indifferent) {
        score += 1;
        continue;
      }
      if (def.ability === 'tragic_figure') {
        const martyrs = p.collected.filter((x) => nobleById(x.defId)?.suit === 'martyr').length;
        score -= martyrs;
        continue;
      }
      let pts = def.points;
      if (def.ability === 'pair_count') {
        if (p.collected.some((x) => nobleById(x.defId)?.ability === 'pair_countess')) pts += 2;
      }
      if (def.ability === 'pair_countess') {
        if (p.collected.some((x) => nobleById(x.defId)?.ability === 'pair_count')) pts += 2;
      }
      score += pts;
    }
    for (const f of p.frontCards) {
      const eff = actionById(f.defId)?.effect;
      if (!eff) continue;
      if (eff.kind === 'fountain_of_blood') score += 2;
      if (eff.kind === 'front_penalty') score -= eff.amount;
      if (eff.kind === 'support_suit') {
        score += p.collected.filter((c) => nobleById(c.defId)?.suit === eff.suit).length;
      }
    }
    score -= p.penalties;
    return score;
  }

  private currentPlayer(): InternalPlayer | null {
    return this.players.find((p) => p.id === this.currentPlayerId) ?? null;
  }

  private frontIsUnpopularJudge(): boolean {
    const front = this.line[0];
    if (!front) return false;
    return nobleById(front.defId)?.ability === 'unpopular_judge';
  }

  private moveMasterSpies(): void {
    const spies = this.line.filter((n) => nobleById(n.defId)?.ability === 'master_spy');
    if (!spies.length) return;
    const before = new Map(this.line.map((n, i) => [n.instanceId, i]));
    this.line = this.line.filter((n) => nobleById(n.defId)?.ability !== 'master_spy');
    this.line.push(...spies);
    for (const spy of spies) {
      const from = before.get(spy.instanceId) ?? -1;
      const to = this.line.findIndex((n) => n.instanceId === spy.instanceId);
      if (from >= 0 && to >= 0 && from !== to) {
        this.pendingAnims.push({
          type: 'line_walk',
          instanceId: spy.instanceId,
          defId: spy.defId,
          fromFront: from === 0,
        });
      }
    }
  }

  skipAction(playerId: string): { ok: boolean; error?: string } {
    if (this.phase !== 'action') return { ok: false, error: 'Not action phase' };
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Not your turn' };
    this.actionsRemaining = 0;
    return this.deferCollect();
  }

  playCard(playerId: string, cardInstanceId: string): { ok: boolean; error?: string } {
    if (this.phase !== 'action') return { ok: false, error: 'Not action phase' };
    if (playerId !== this.currentPlayerId) return { ok: false, error: 'Not your turn' };
    if (this.actionLocked) return { ok: false, error: 'Rush Job: you cannot play an action this turn' };
    if (this.actionsRemaining <= 0) return { ok: false, error: 'No actions left' };
    if (this.frontIsUnpopularJudge()) return { ok: false, error: 'Actions blocked while judge is at front' };

    const player = this.currentPlayer();
    if (!player) return { ok: false, error: 'No player' };
    const idx = player.hand.findIndex((c) => c.instanceId === cardInstanceId);
    if (idx < 0) return { ok: false, error: 'Card not in hand' };

    const card = player.hand[idx];
    const def = actionById(card.defId);
    if (!def) return { ok: false, error: 'Unknown card' };

    if (this.callousActive() && isLineAltering(def.effect)) {
      return { ok: false, error: 'Callous Guards block line-altering actions' };
    }
    if (!actionIsPlayable(this.getPublicState(), def.effect, playerId)) {
      return { ok: false, error: 'That action has no legal play right now' };
    }

    player.hand.splice(idx, 1);
    this.actionsRemaining -= 1;
    this.pushLog(`${player.name} plays ${def.name}.`);
    this.pendingReveal = { playerId, card, effect: def.effect };
    this.phase = 'revealing';
    this.pendingAnims.push({
      type: 'reveal_action',
      playerId,
      defId: card.defId,
      instanceId: card.instanceId,
    });
    return { ok: true };
  }

  commitReveal(): { ok: boolean; error?: string } {
    if (this.phase !== 'revealing' || !this.pendingReveal) return { ok: false, error: 'Nothing to reveal' };
    const { playerId, card, effect } = this.pendingReveal;
    this.pendingReveal = null;
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'No player' };
    const staysOut =
      effect.kind === 'callous_guards' ||
      effect.kind === 'support_suit' ||
      effect.kind === 'indifferent_public' ||
      effect.kind === 'fountain_of_blood' ||
      effect.kind === 'foreign_support';
    if (staysOut) {
      this.pendingAnims.push({ type: 'play_front', playerId, defId: card.defId, instanceId: card.instanceId });
    } else if (effect.kind === 'front_penalty') {
      this.pendingFrontCard = card;
    } else {
      this.discardFrom(playerId, [card]);
    }
    return this.resolveEffect(player, card, effect);
  }

  /** Discard your own Callous Guards anytime */
  discardFrontCard(playerId: string, frontInstanceId: string): { ok: boolean; error?: string } {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'No player' };
    const i = player.frontCards.findIndex((f) => f.instanceId === frontInstanceId);
    if (i < 0) return { ok: false, error: 'Not found' };
    const [card] = player.frontCards.splice(i, 1);
    this.discardFrom(playerId, [{ instanceId: card.instanceId, defId: card.defId }]);
    return { ok: true };
  }

  private needsTarget(effect: ActionEffect): boolean {
    switch (effect.kind) {
      case 'reverse_line':
      case 'front_to_end':
      case 'randomize_front_n':
      case 'randomize_line':
      case 'escape':
      case 'redeal_line':
      case 'add_nobles_to_end':
      case 'late_arrival':
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
      case 'move_ability_to_front':
        return false;
      default:
        return true;
    }
  }

  private resolveEffect(
    player: InternalPlayer,
    card: ActionInstance,
    effect: ActionEffect,
  ): { ok: boolean; error?: string } {
    if (!this.needsTarget(effect)) {
      this.applyImmediate(player, card, effect);
      this.moveMasterSpies();
      if (this.phase === 'results' || this.phase === 'between_days') return { ok: true };
      if (this.actionsRemaining > 0 && this.phase === 'action') return { ok: true };
      return this.deferCollect();
    }
    this.phase = 'targeting';
    this.targeting = {
      playerId: player.id,
      cardInstanceId: card.instanceId,
      effect,
      step: 0,
      picks: [],
    };
    return { ok: true };
  }

  private applyImmediate(player: InternalPlayer, card: ActionInstance, effect: ActionEffect): void {
    switch (effect.kind) {
      case 'reverse_line':
        this.line.reverse();
        break;
      case 'front_to_end':
        if (this.line.length) {
          const f = this.line.shift()!;
          this.line.push(f);
        }
        break;
      case 'randomize_front_n': {
        const n = Math.min(effect.n, this.line.length);
        const front = shuffle(this.line.slice(0, n));
        this.line = [...front, ...this.line.slice(n)];
        break;
      }
      case 'randomize_line':
        this.line = shuffle(this.line);
        break;
      case 'escape': {
        for (let i = 0; i < 2 && this.line.length; i++) {
          const idx = Math.floor(Math.random() * this.line.length);
          const [gone] = this.line.splice(idx, 1);
          this.discardNobles([gone]);
        }
        this.line = shuffle(this.line);
        break;
      }
      case 'redeal_line': {
        const returning = [...this.line];
        this.line = [];
        for (const card of returning) {
          this.pendingAnims.push({ type: 'return_to_deck', instanceId: card.instanceId, defId: card.defId });
          this.nobleDeck.push({ instanceId: uid(), defId: card.defId });
        }
        this.nobleDeck = shuffle(this.nobleDeck);
        for (let i = 0; i < this.lineSize && this.nobleDeck.length; i++) {
          const n = this.nobleDeck.pop()!;
          this.dealNobleToLine(n);
        }
        break;
      }
      case 'add_nobles_to_end':
        for (let i = 0; i < effect.count; i++) {
          const n = this.nobleDeck.pop();
          if (n) this.dealNobleToLine(n);
        }
        break;
      case 'late_arrival': {
        const top = this.nobleDeck.splice(-3);
        if (top.length) {
          const pick = top.pop()!;
          this.dealNobleToLine(pick);
          this.nobleDeck.push(...shuffle(top));
        }
        break;
      }
      case 'collect_extra_front':
        this.pendingExtraCollect = true;
        break;
      case 'draw_skip_collect':
        for (let i = 0; i < effect.count; i++) {
          this.giveAction(player, this.drawActionFor(player));
        }
        this.skipCollectThisTurn = true;
        break;
      case 'rain_delay':
        for (const p of this.players) {
          const n = p.hand.length;
          this.discardFrom(p.id, p.hand);
          p.hand = [];
          for (let i = 0; i < n; i++) {
            this.giveAction(p, this.drawActionFor(p));
          }
        }
        break;
      case 'callous_guards':
      case 'support_suit':
      case 'indifferent_public':
      case 'fountain_of_blood':
      case 'foreign_support':
        player.frontCards.push({
          instanceId: card.instanceId,
          defId: card.defId,
          dayPlayed: this.day,
        });
        break;
      case 'all_discard_random':
        for (const p of this.players) {
          if (p.id === player.id || !p.hand.length) continue;
          const i = Math.floor(Math.random() * p.hand.length);
          this.discardFrom(p.id, p.hand.splice(i, 1));
        }
        break;
      case 'end_day_after_turn':
        this.endDayAfterTurn = true;
        break;
      case 'move_named_to_front': {
        const i = this.line.findIndex((n) => nobleById(n.defId)?.id.replace(/_\d+$/, '') === effect.nobleId || n.defId.startsWith(effect.nobleId));
        if (i >= 0) {
          const [c] = this.line.splice(i, 1);
          this.line.unshift(c);
        }
        break;
      }
      case 'move_ability_to_front': {
        const i = this.line.findIndex((n) => nobleById(n.defId)?.ability === effect.ability);
        if (i >= 0) {
          const [c] = this.line.splice(i, 1);
          this.line.unshift(c);
        }
        break;
      }
      default:
        break;
    }
  }

  previewTargets(playerId: string, picks: string[]): { ok: boolean; error?: string } {
    if (this.phase !== 'targeting' || !this.targeting) return { ok: false, error: 'Not targeting' };
    if (playerId !== this.targeting.playerId) return { ok: false, error: 'Not your targeting' };
    if (this.targeting.picks.length) return { ok: false, error: 'Already chosen' };
    this.targeting = { ...this.targeting, picks: [...picks] };
    return { ok: true };
  }

  submitTargets(playerId: string, picks: string[]): { ok: boolean; error?: string } {
    if (this.phase !== 'targeting' || !this.targeting) return { ok: false, error: 'Not targeting' };
    if (playerId !== this.targeting.playerId) return { ok: false, error: 'Not your targeting' };
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: 'No player' };
    const effect = this.targeting.effect;
    if (effect.kind === 'clerical_error') {
      return this.submitClerical(player, picks);
    }
    if (effect.kind === 'discard_n_from_hand') {
      return this.submitInfighting(player, picks);
    }
    if (effect.kind === 'discard_from_hand') {
      return this.submitLackSupport(player, picks);
    }
    // Late Night already handed off but targeting never cleared — unstick.
    if (effect.kind === 'place_clown' && !this.pendingClownCard) {
      this.targeting = null;
      return this.resumeAfterClown(player);
    }
    const err = this.applyTargeted(player, effect, picks);
    if (err) return { ok: false, error: err };
    if (isPlayerTargetEffect(effect.kind) && effect.kind !== 'place_clown') {
      const target = this.players.find((p) => p.id === picks[0]);
      if (target) this.pushLog(`${player.name} targets ${target.name}.`);
    }
    this.targeting = null;
    if (effect.kind === 'place_clown') {
      return this.resumeAfterClown(player);
    }
    this.moveMasterSpies();
    this.phase = 'action';
    if (this.actionsRemaining > 0) return { ok: true };
    return this.deferCollect();
  }

  private finishTargetedAction(player: InternalPlayer): { ok: boolean; error?: string } {
    this.targeting = null;
    this.moveMasterSpies();
    this.phase = 'action';
    if (this.actionsRemaining > 0) return { ok: true };
    return this.deferCollect();
  }

  private submitLackSupport(chooser: InternalPlayer, picks: string[]): { ok: boolean; error?: string } {
    const t = this.targeting;
    if (!t || t.effect.kind !== 'discard_from_hand') return { ok: false, error: 'Not targeting' };
    const actor = this.players.find((p) => p.id === this.currentPlayerId);
    if (!actor || chooser.id !== actor.id) return { ok: false, error: 'Not your targeting' };

    if ((t.step ?? 0) === 0) {
      const victim = this.players.find((p) => p.id === picks[0]);
      if (!victim || victim.id === actor.id || !victim.hand.length) {
        return { ok: false, error: 'Invalid player' };
      }
      this.targeting = { ...t, step: 1, picks: [victim.id] };
      this.pushLog(`${actor.name} looks at ${victim.name}'s hand.`);
      return { ok: true };
    }

    const victim = this.players.find((p) => p.id === t.picks[0]);
    if (!victim) return { ok: false, error: 'Invalid player' };
    const cardId = picks.find((id) => id !== victim.id);
    if (!cardId) return { ok: false, error: 'Pick a card' };
    const i = victim.hand.findIndex((c) => c.instanceId === cardId);
    if (i < 0) return { ok: false, error: 'Card not found' };
    const [card] = victim.hand.splice(i, 1);
    this.discardFrom(victim.id, [card]);
    this.pushLog(
      `${actor.name} discards ${actionById(card.defId)?.name ?? 'a card'} from ${victim.name}'s hand.`,
    );
    return this.finishTargetedAction(actor);
  }

  private submitInfighting(chooser: InternalPlayer, picks: string[]): { ok: boolean; error?: string } {
    const t = this.targeting;
    if (!t || t.effect.kind !== 'discard_n_from_hand') return { ok: false, error: 'Not targeting' };
    const actor = this.players.find((p) => p.id === this.currentPlayerId);
    if (!actor) return { ok: false, error: 'No player' };
    const need = t.effect.count;

    if ((t.step ?? 0) === 0) {
      const victim = this.players.find((p) => p.id === picks[0]);
      if (!victim || victim.id === actor.id || victim.hand.length < need) {
        return { ok: false, error: 'Invalid player' };
      }
      this.targeting = { ...t, playerId: victim.id, step: 1, picks: [victim.id] };
      this.pushLog(`${actor.name} forces ${victim.name} to discard ${need} cards.`);
      return { ok: true };
    }

    const victim = this.players.find((p) => p.id === t.picks[0]);
    if (!victim || chooser.id !== victim.id) return { ok: false, error: 'Invalid player' };
    const ids = picks.filter((id) => id !== victim.id).slice(0, need);
    if (ids.length < need) return { ok: false, error: 'Pick more cards' };
    const dumped: ActionInstance[] = [];
    for (const id of ids) {
      const i = victim.hand.findIndex((c) => c.instanceId === id);
      if (i < 0) return { ok: false, error: 'Card not in hand' };
      dumped.push(victim.hand.splice(i, 1)[0]);
    }
    this.discardFrom(victim.id, dumped);
    return this.finishTargetedAction(actor);
  }

  private submitClerical(chooser: InternalPlayer, picks: string[]): { ok: boolean; error?: string } {
    const t = this.targeting;
    if (!t) return { ok: false, error: 'Not targeting' };
    const actor = this.players.find((p) => p.id === this.currentPlayerId);
    if (!actor) return { ok: false, error: 'No player' };

    if (t.step === 0) {
      const victim = this.players.find((p) => p.id === picks[0]);
      if (!victim || victim.id === actor.id || !victim.collected.length) return { ok: false, error: 'Invalid player' };
      this.targeting = { ...t, step: 1, picks: [victim.id] };
      return { ok: true };
    }

    if (t.step === 1) {
      const victimId = t.picks[0];
      const takeId = picks.length >= 2 ? picks[1] : picks[0];
      const victim = this.players.find((p) => p.id === victimId);
      if (!victim) return { ok: false, error: 'Invalid player' };
      const ti = victim.collected.findIndex((c) => c.instanceId === takeId);
      if (ti < 0) return { ok: false, error: 'Invalid steal' };
      const [taken] = victim.collected.splice(ti, 1);
      actor.collected.push(taken);
      this.triggerForeignSupport(actor, taken);
      this.checkEndDayNoble(taken);
      this.pendingAnims.push({
        type: 'collect_noble',
        playerId: actor.id,
        instanceId: taken.instanceId,
        defId: taken.defId,
      });
      this.pushLog(`${actor.name} takes ${nobleById(taken.defId)?.name ?? 'a figure'} from ${victim.name}.`);
      const giveChoices = actor.collected.filter((c) => c.instanceId !== taken.instanceId);
      if (!giveChoices.length) return this.finishTargetedAction(actor);
      this.targeting = { ...t, playerId: victim.id, step: 2, picks: [victim.id, taken.instanceId] };
      return { ok: true };
    }

    if (t.step === 2) {
      const giveId = picks[picks.length - 1];
      const gi = actor.collected.findIndex((c) => c.instanceId === giveId);
      if (gi < 0 || actor.collected[gi].instanceId === t.picks[1]) return { ok: false, error: 'Invalid return' };
      const [given] = actor.collected.splice(gi, 1);
      chooser.collected.push(given);
      this.triggerForeignSupport(chooser, given);
      this.checkEndDayNoble(given);
      this.pendingAnims.push({
        type: 'collect_noble',
        playerId: chooser.id,
        instanceId: given.instanceId,
        defId: given.defId,
      });
      this.pushLog(`${chooser.name} takes ${nobleById(given.defId)?.name ?? 'a figure'} from ${actor.name}.`);
      return this.finishTargetedAction(actor);
    }

    return { ok: false, error: 'Invalid step' };
  }

  /** Pause so the client can animate the action before the collect. */
  private deferCollect(): { ok: boolean; error?: string } {
    if (this.phase === 'results') return { ok: true };
    this.phase = 'resolving';
    this.targeting = null;
    return { ok: true };
  }

  commitTurn(): { ok: boolean; error?: string } {
    if (this.phase !== 'resolving') return { ok: false, error: 'Nothing to commit' };
    return this.finishActionsAndCollect();
  }

  private applyTargeted(player: InternalPlayer, effect: ActionEffect, picks: string[]): string | null {
    const lineIndex = (id: string) => this.line.findIndex((n) => n.instanceId === id);

    switch (effect.kind) {
      case 'move_forward':
      case 'move_forward_exact':
      case 'move_suit_forward': {
        const id = picks[0];
        const i = lineIndex(id);
        if (i < 0) return 'Invalid figure';
        if (effect.kind === 'move_suit_forward') {
          if (nobleById(this.line[i].defId)?.suit !== effect.suit) return 'Wrong suit';
        }
        const max =
          effect.kind === 'move_forward_exact'
            ? effect.n
            : effect.kind === 'move_forward'
              ? effect.max
              : effect.max;
        const dist =
          effect.kind === 'move_forward_exact'
            ? effect.n
            : Math.min(max, Number(picks[1] ?? max));
        if (effect.kind === 'move_forward_exact') {
          if (i < effect.n) return 'Not enough room to move exactly that far';
        }
        const move = effect.kind === 'move_forward_exact' ? effect.n : Math.min(dist, i);
        if (move <= 0) return 'Cannot move that figure';
        const [card] = this.line.splice(i, 1);
        this.line.splice(i - move, 0, card);
        return null;
      }
      case 'move_back':
      case 'move_back_exact_extra': {
        const id = picks[0];
        const i = lineIndex(id);
        if (i < 0) return 'Invalid figure';
        const exact = effect.kind === 'move_back_exact_extra' ? effect.n : Number(picks[1] ?? effect.max);
        const max = effect.kind === 'move_back_exact_extra' ? effect.n : effect.max;
        if (effect.kind === 'move_back_exact_extra') {
          if (i + effect.n > this.line.length - 1) return 'Not enough room to move exactly that far';
        }
        const move = effect.kind === 'move_back_exact_extra' ? effect.n : Math.min(exact, max, this.line.length - 1 - i);
        const [card] = this.line.splice(i, 1);
        this.line.splice(i + move, 0, card);
        if (effect.kind === 'move_back_exact_extra') this.actionsRemaining += 1;
        return null;
      }
      case 'move_to_front': {
        const i = lineIndex(picks[0]);
        if (i < 0) return 'Invalid figure';
        const [card] = this.line.splice(i, 1);
        this.line.unshift(card);
        return null;
      }
      case 'move_suit_to_front': {
        const i = lineIndex(picks[0]);
        if (i < 0) return 'Invalid figure';
        if (nobleById(this.line[i].defId)?.suit !== effect.suit) return 'Wrong suit';
        const [card] = this.line.splice(i, 1);
        this.line.unshift(card);
        return null;
      }
      case 'remove_from_line':
      case 'discard_and_replace': {
        const i = lineIndex(picks[0]);
        if (i < 0) return 'Invalid figure';
        const [removed] = this.line.splice(i, 1);
        this.discardNobles([removed]);
        if (effect.kind === 'discard_and_replace') {
          const n = this.nobleDeck.pop();
          if (n) {
            this.line.splice(i, 0, n);
            this.pendingAnims.push({ type: 'deal_noble', instanceId: n.instanceId, defId: n.defId });
          }
        }
        return null;
      }
      case 'rearrange_front_n': {
        const n = Math.min(effect.n, this.line.length);
        if (picks.length !== n) return 'Need full order';
        const front = this.line.slice(0, n);
        const map = new Map(front.map((c) => [c.instanceId, c]));
        if (picks.some((id) => !map.has(id))) return 'Invalid order';
        this.line = [...picks.map((id) => map.get(id)!), ...this.line.slice(n)];
        return null;
      }
      case 'give_front_to_player': {
        const target = this.players.find((p) => p.id === picks[0]);
        if (!target || !this.line.length) return 'Invalid';
        const card = this.line.shift()!;
        card.dayCollected = this.day;
        target.collected.push(card);
        this.pendingAnims.push({
          type: 'collect_noble',
          playerId: target.id,
          instanceId: card.instanceId,
          defId: card.defId,
        });
        this.triggerForeignSupport(target, card);
        return null;
      }
      case 'missed': {
        const victim = this.players.find((p) => p.id === picks[0]);
        if (!victim || victim.id === player.id) return 'Choose another player';
        const last = victim.collected.pop();
        if (!last) return 'They have no figures';
        delete last.dayCollected;
        this.line.push(last);
        return null;
      }
      case 'from_discard': {
        const i = this.actionDiscard.findIndex((c) => c.instanceId === picks[0]);
        if (i < 0) return 'Not in discard';
        const [c] = this.actionDiscard.splice(i, 1);
        this.giveAction(player, c);
        return null;
      }
      case 'random_lose_noble': {
        const victim = this.players.find((p) => p.id === picks[0]);
        if (!victim?.collected.length) return 'No figures';
        const i = Math.floor(Math.random() * victim.collected.length);
        const [gone] = victim.collected.splice(i, 1);
        this.discardNobles([gone], victim.id);
        return null;
      }
      case 'penalty': {
        const victim = this.players.find((p) => p.id === picks[0]);
        if (!victim) return 'Invalid player';
        victim.penalties += effect.amount;
        return null;
      }
      case 'front_penalty': {
        const victim = this.players.find((p) => p.id === picks[0]);
        const held = this.pendingFrontCard;
        if (!victim || victim.id === player.id) return 'Choose another player';
        if (!held) return 'Missing card';
        this.pendingFrontCard = null;
        victim.frontCards.push({
          instanceId: held.instanceId,
          defId: held.defId,
          dayPlayed: this.day,
        });
        this.pendingAnims.push({
          type: 'play_front',
          playerId: victim.id,
          defId: held.defId,
          instanceId: held.instanceId,
        });
        return null;
      }
      case 'discard_front_card': {
        for (const p of this.players) {
          const i = p.frontCards.findIndex((f) => f.instanceId === picks[0]);
          if (i >= 0) {
            const [f] = p.frontCards.splice(i, 1);
            this.discardFrom(p.id, [{ instanceId: f.instanceId, defId: f.defId }]);
            return null;
          }
        }
        return 'Not found';
      }
      case 'skip_opponent_turn': {
        const t = this.players.find((p) => p.id === picks[0]);
        if (!t || t.id === player.id) return 'Invalid';
        t.skipNextTurn = true;
        return null;
      }
      case 'discard_from_hand': {
        return 'Choose a card from their hand';
      }
      case 'swap_hands': {
        const other = this.players.find((p) => p.id === picks[0]);
        if (!other || other.id === player.id) return 'Invalid';
        const tmp = player.hand;
        player.hand = other.hand;
        other.hand = tmp;
        return null;
      }
      case 'place_clown': {
        const victim = this.players.find((p) => p.id === picks[0] && p.id !== player.id);
        const card = this.pendingClownCard;
        if (!victim || !card) return 'Choose another player';
        this.pendingClownCard = null;
        card.dayCollected = this.day;
        victim.collected.push(card);
        this.pendingAnims.push({
          type: 'collect_noble',
          playerId: victim.id,
          instanceId: card.instanceId,
          defId: card.defId,
        });
        this.pushLog(`${player.name} gives ${nobleById(card.defId)?.name ?? 'Late Night'} to ${victim.name}`);
        this.triggerForeignSupport(victim, card);
        return null;
      }
      default:
        return 'Unhandled';
    }
  }

  private finishActionsAndCollect(): { ok: boolean; error?: string } {
    if (this.phase === 'results') return { ok: true };
    const player = this.currentPlayer();
    if (!player) return { ok: false, error: 'No player' };

    if (this.skipCollectThisTurn) {
      this.skipCollectThisTurn = false;
      this.afterTurn(player);
      return { ok: true };
    }

    if (!this.line.length) {
      this.endDay();
      return { ok: true };
    }

    this.phase = 'collect';
    this.collectFront(player);
    if (this.targeting) {
      this.collectPaused = 'after_first';
      return { ok: true };
    }
    if (this.pendingExtraCollect && this.line.length && !this.endDayFromNoble) {
      this.pendingExtraCollect = false;
      this.collectFront(player);
      if (this.targeting) {
        this.collectPaused = 'after_extra';
        return { ok: true };
      }
    }
    this.phase = 'post_collect';
    return { ok: true };
  }

  private resumeAfterClown(player: InternalPlayer): { ok: boolean; error?: string } {
    if (this.collectPaused === 'after_first') {
      this.collectPaused = null;
      if (this.pendingExtraCollect && this.line.length && !this.endDayFromNoble) {
        this.pendingExtraCollect = false;
        // Collect may have left phase === 'targeting' from Late Night; clear it so a
        // normal second collect is not mistaken for another pending choice.
        this.phase = 'collect';
        this.collectFront(player);
        if (this.targeting) {
          this.collectPaused = 'after_extra';
          return { ok: true };
        }
      }
    }
    this.collectPaused = null;
    this.phase = 'post_collect';
    return { ok: true };
  }

  completePostCollect(): { ok: boolean; error?: string } {
    if (this.phase !== 'post_collect') return { ok: false, error: 'Not post-collect' };
    const player = this.currentPlayer();
    if (!player) return { ok: false, error: 'No player' };
    this.afterTurn(player);
    return { ok: true };
  }

  private collectFront(player: InternalPlayer): void {
    const card = this.line.shift();
    if (!card) return;
    this.gainNoble(player, card);
  }

  private gainNoble(player: InternalPlayer, card: NobleInstance, fromDeck = false): void {
    const def = nobleById(card.defId);
    card.dayCollected = this.day;

    if (def?.ability === 'clown') {
      this.pendingClownCard = card;
      this.phase = 'targeting';
      this.targeting = {
        playerId: player.id,
        cardInstanceId: card.instanceId,
        effect: { kind: 'place_clown' },
        step: 0,
        picks: [],
      };
      this.pushLog(`${player.name} collected ${def.name} — choose who gets it.`);
      return;
    }

    player.collected.push(card);
    this.dayCollectedCounts[player.id] = (this.dayCollectedCounts[player.id] ?? 0) + 1;
    this.pendingAnims.push({
      type: 'collect_noble',
      playerId: player.id,
      instanceId: card.instanceId,
      defId: card.defId,
      fromDeck,
    });
    this.pushLog(`${player.name} collects ${def?.name ?? 'a figure'} (${def?.points ?? '?'})`);
    this.triggerForeignSupport(player, card);

    if (def?.ability === 'draw_action') {
      this.giveAction(player, this.drawActionFor(player));
    }
    if (def?.ability === 'add_noble_to_end') {
      const n = this.nobleDeck.pop();
      if (n) this.dealNobleToLine(n);
    }
    if (def?.ability === 'rival_executioner' && !fromDeck) {
      const n = this.nobleDeck.pop();
      if (n) this.gainNoble(player, n, true);
    }
    if (def?.ability === 'fast_noble' && this.line.length) {
      this.collectFront(player);
    }
    if (def?.ability === 'innocent_victim' && player.hand.length) {
      this.discardFrom(player.id, [player.hand.pop()!]);
    }
    this.checkEndDayNoble(card);
  }

  private checkEndDayNoble(card: NobleInstance): void {
    if (this.houseRules.noPrematureEndings) return;
    if (nobleById(card.defId)?.ability === 'end_day') {
      this.endDayFromNoble = true;
      this.pushLog(`${nobleById(card.defId)?.name} ends the day after this collect.`);
    }
  }

  private triggerForeignSupport(player: InternalPlayer, card: NobleInstance): void {
    const def = nobleById(card.defId);
    if (def?.suit !== 'executive') return;
    const has = player.frontCards.some((f) => actionById(f.defId)?.effect.kind === 'foreign_support');
    if (!has) return;
    this.giveAction(player, this.drawActionFor(player));
  }

  private afterTurn(player: InternalPlayer): void {
    this.giveAction(player, this.drawActionFor(player));

    if (this.endDayAfterTurn || this.endDayFromNoble || !this.line.length) {
      this.endDayAfterTurn = false;
      this.endDayFromNoble = false;
      this.endDay();
      return;
    }

    this.advanceTurn();
  }

  private advanceTurn(): void {
    let idx = this.players.findIndex((p) => p.id === this.currentPlayerId);
    for (let step = 0; step < this.players.length; step++) {
      idx = (idx + 1) % this.players.length;
      const next = this.players[idx];
      if (next.skipNextTurn) {
        next.skipNextTurn = false;
        this.actionLocked = true;
        this.pushLog(`${next.name} cannot play an action this turn.`);
      } else {
        this.actionLocked = false;
      }
      this.currentPlayerId = next.id;
      this.actionsRemaining = 1;
      this.phase = 'action';
      this.toast = null;
      return;
    }
  }

  private endDay(): void {
    const leftover = this.line.length;
    this.pushLog(leftover ? `Day ${this.day} ends. ${leftover} figure${leftover === 1 ? '' : 's'} left in line are discarded.` : `Day ${this.day} ends.`);
    if (leftover) {
      this.discardNobles([...this.line]);
      this.line = [];
    }
    if (this.day >= 3) {
      this.finishGame();
      return;
    }
    this.phase = 'between_days';
  }

  beginNextDay(): { ok: boolean; error?: string } {
    if (this.phase !== 'between_days') return { ok: false, error: 'Not between days' };
    this.beginDay(this.day + 1);
    return { ok: true };
  }

  private finishGame(): void {
    this.phase = 'results';
    this.toast = 'Final Results';
    this.currentPlayerId = null;
    this.results = this.players
      .map((p) => ({
        playerId: p.id,
        name: p.name,
        isAi: p.isAi,
        days: [1, 2, 3].map((d) => this.dayBreakdown(p, d)),
        tally: this.scoreTally(p),
        finalScore: this.scorePlayer(p),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);
    this.pushLog(`Game over. Winner: ${this.results[0]?.name ?? '—'}`);
  }

  private dayBreakdown(p: InternalPlayer, day: number) {
    const suits: Suit[] = ['executive', 'legislative', 'judicial', 'media', 'martyr'];
    const bySuit = Object.fromEntries(suits.map((s) => [s, { count: 0, points: 0 }])) as Record<
      Suit,
      { count: number; points: number }
    >;
    let total = 0;
    for (const c of p.collected.filter((x) => x.dayCollected === day)) {
      const def = nobleById(c.defId);
      if (!def) continue;
      bySuit[def.suit].count += 1;
      bySuit[def.suit].points += def.points;
      total += def.points;
    }
    return { day, bySuit, fountainBonus: 0, supportBonus: 0, total };
  }

  private scoreTally(p: InternalPlayer): ScoreLine[] {
    const lines: ScoreLine[] = [];
    const indifferent = p.frontCards.some(
      (f) => actionById(f.defId)?.effect.kind === 'indifferent_public',
    );
    const clerkCount = p.collected.filter((c) => nobleById(c.defId)?.ability === 'palace_guard').length;
    const martyrCount = p.collected.filter((c) => nobleById(c.defId)?.suit === 'martyr').length;
    for (const c of p.collected) {
      const def = nobleById(c.defId);
      if (!def) continue;
      let points = def.points;
      if (def.ability === 'palace_guard') points = clerkCount;
      else if (def.suit === 'martyr' && indifferent) points = 1;
      else if (def.ability === 'tragic_figure') points = -martyrCount;
      else {
        if (def.ability === 'pair_count' && p.collected.some((x) => nobleById(x.defId)?.ability === 'pair_countess')) {
          points += 2;
        }
        if (def.ability === 'pair_countess' && p.collected.some((x) => nobleById(x.defId)?.ability === 'pair_count')) {
          points += 2;
        }
      }
      lines.push({
        kind: 'noble',
        defId: c.defId,
        instanceId: c.instanceId,
        label: def.name,
        points,
      });
    }
    for (const f of p.frontCards) {
      const def = actionById(f.defId);
      const eff = def?.effect;
      if (!def || !eff) continue;
      let points = 0;
      if (eff.kind === 'fountain_of_blood') points = 2;
      if (eff.kind === 'front_penalty') points = -eff.amount;
      if (eff.kind === 'support_suit') {
        points = p.collected.filter((c) => nobleById(c.defId)?.suit === eff.suit).length;
      }
      lines.push({
        kind: 'action',
        defId: f.defId,
        instanceId: f.instanceId,
        label: def.name,
        points,
      });
    }
    if (p.penalties) {
      lines.push({ kind: 'penalty', label: 'Penalties', points: -p.penalties });
    }
    return lines;
  }

  getResults(): PlayerResult[] | null {
    return this.results;
  }
}
