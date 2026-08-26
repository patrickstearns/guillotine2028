import { io, type Socket } from 'socket.io-client';
import type {
  GamePublicState,
  LobbyGameSummary,
  LobbyPlayer,
  PlayerResult,
  PrivateHand,
} from '../shared/types';

export type RoomView = {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  houseRules: { label: string; notes: string; catalogDeal?: boolean; noPrematureEndings?: boolean };
  started: boolean;
  players: { id: string; name: string; connected: boolean; isAi?: boolean }[];
};

export type LobbySnapshot = {
  players: LobbyPlayer[];
  games: LobbyGameSummary[];
};

type Handlers = {
  onLobby?: (lobby: LobbySnapshot) => void;
  onRoom?: (room: RoomView) => void;
  onRoomCancelled?: () => void;
  onGame?: (payload: {
    public: GamePublicState;
    hand: PrivateHand;
    results: PlayerResult[] | null;
  }) => void;
  onDropped?: (payload: { name: string; lobby: LobbySnapshot }) => void;
};

let socket: Socket | null = null;
let playerId: string | null = null;
let playerName: string | null = null;

export function getPlayerId() {
  return playerId;
}
export function getPlayerName() {
  return playerName;
}

export function connect(handlers: Handlers): Socket {
  if (socket) socket.disconnect();
  socket = io({ path: '/socket.io' });

  socket.on('lobby:update', (lobby: LobbySnapshot) => handlers.onLobby?.(lobby));
  socket.on('room:update', (room: RoomView) => handlers.onRoom?.(room));
  socket.on('room:cancelled', () => handlers.onRoomCancelled?.());
  socket.on('game:dropped', (payload: { name: string; lobby: LobbySnapshot }) =>
    handlers.onDropped?.(payload),
  );
  socket.on(
    'game:state',
    (payload: { public: GamePublicState; hand: PrivateHand; results: PlayerResult[] | null }) =>
      handlers.onGame?.(payload),
  );

  return socket;
}

function s(): Socket {
  if (!socket) throw new Error('Not connected');
  return socket;
}

export function joinLobby(name: string): Promise<{ ok: boolean; playerId?: string; lobby?: LobbySnapshot; error?: string }> {
  return new Promise((resolve) => {
    s().emit('lobby:join', { name }, (r: { ok: boolean; playerId?: string; name?: string; lobby?: LobbySnapshot; error?: string }) => {
      if (r.ok) {
        playerId = r.playerId ?? null;
        playerName = r.name ?? name;
      }
      resolve(r);
    });
  });
}

export function createGame(opts?: {
  name?: string;
  maxPlayers?: number;
  houseRules?: { label: string; notes: string; catalogDeal?: boolean; noPrematureEndings?: boolean };
}): Promise<{ ok: boolean; roomId?: string; room?: RoomView; error?: string }> {
  return new Promise((resolve) => s().emit('game:create', opts ?? {}, resolve));
}

export function createTestGame(): Promise<{ ok: boolean; roomId?: string; room?: RoomView; error?: string }> {
  return new Promise((resolve) => s().emit('game:create-test', resolve));
}

export function joinGame(
  roomId: string,
): Promise<{ ok: boolean; room?: RoomView; playerId?: string; error?: string }> {
  return new Promise((resolve) => {
    s().emit('game:join', { roomId }, (r: { ok: boolean; room?: RoomView; playerId?: string; error?: string }) => {
      if (r.ok && r.playerId) playerId = r.playerId;
      resolve(r);
    });
  });
}

export function leaveGame(): Promise<{ ok: boolean; lobby?: LobbySnapshot }> {
  return new Promise((resolve) => s().emit('game:leave', resolve));
}

export function cancelGame(): Promise<{ ok: boolean; lobby?: LobbySnapshot; error?: string }> {
  return new Promise((resolve) => s().emit('game:cancel', resolve));
}

export function startGame(aiCount = 0): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s().emit('game:start', { aiCount }, resolve));
}

export function addAiPlayer(): Promise<{ ok: boolean; room?: RoomView; error?: string }> {
  return new Promise((resolve) => s().emit('game:add-ai', resolve));
}

export function removeAiPlayer(playerId: string): Promise<{ ok: boolean; room?: RoomView; error?: string }> {
  return new Promise((resolve) => s().emit('game:remove-ai', { playerId }, resolve));
}

export function playCard(cardInstanceId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s().emit('game:play', { cardInstanceId }, resolve));
}

export function skipAction(): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s().emit('game:skip', resolve));
}

export function previewTargets(picks: string[]): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s().emit('game:target-preview', { picks }, resolve));
}

export function submitTargets(picks: string[]): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s().emit('game:targets', { picks }, resolve));
}

export function discardFront(frontInstanceId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => s().emit('game:discard-front', { frontInstanceId }, resolve));
}

export function exitToLobby(): Promise<{ ok: boolean; lobby?: LobbySnapshot }> {
  return new Promise((resolve) => s().emit('game:exit', resolve));
}
