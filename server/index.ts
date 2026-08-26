import express from 'express';
import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import { randomUUID } from 'crypto';
import { GuillotineEngine } from '../shared/engine.js';
import { aiShouldAct, pumpAi } from '../shared/ai.js';
import { buildHouseRules } from '../shared/houseRules.js';
import { pickAiName } from '../shared/aiNames.js';
import type { HouseRules, LobbyGameSummary, LobbyPlayer } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3001);

interface Seat {
  id: string;
  name: string;
  socketId: string | null;
  isAi?: boolean;
}

interface Room {
  id: string;
  name: string;
  hostId: string;
  maxPlayers: number;
  houseRules: HouseRules;
  seats: Seat[];
  engine: GuillotineEngine | null;
}

const lobbyPlayers = new Map<string, LobbyPlayer & { socketId: string }>();
const rooms = new Map<string, Room>();
const socketMeta = new Map<string, { playerId: string; name: string; roomId: string | null }>();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
});

const distPath = path.resolve(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) res.status(404).send('Build the client with npm run build, or use npm run dev');
  });
});

const AFK_MS = 120_000;

function lobbySnapshot() {
  return {
    players: [...lobbyPlayers.values()].map(({ id, name }) => ({ id, name })),
    games: [...rooms.values()]
      .filter((r) => r.engine?.getPublicState().phase !== 'results')
      .map(
        (r): LobbyGameSummary => ({
          id: r.id,
          name: r.name,
          hostName: r.seats.find((s) => s.id === r.hostId)?.name ?? 'Host',
          playerCount: r.seats.length,
          maxPlayers: r.maxPlayers,
          started: !!r.engine?.started,
          houseRulesLabel: r.houseRules.label,
          rejoinNames: r.engine?.started
            ? r.seats.filter((s) => !s.socketId).map((s) => s.name)
            : [],
        }),
      ),
  };
}

function destroyRoom(room: Room): void {
  clearAiTimer(room.id);
  clearAfkTimer(room.id);
  const t = commitTimers.get(room.id);
  if (t) clearTimeout(t);
  commitTimers.delete(room.id);
  rooms.delete(room.id);
}

function humanSeats(room: Room): Seat[] {
  return room.seats.filter((s) => !s.isAi);
}

function maybeDestroyFinishedRoom(room: Room): boolean {
  const ended = room.engine?.getPublicState().phase === 'results';
  if (!ended) return false;
  if (humanSeats(room).some((s) => s.socketId)) return false;
  destroyRoom(room);
  return true;
}

function broadcastLobby(): void {
  io.emit('lobby:update', lobbySnapshot());
}

const aiTimers = new Map<string, ReturnType<typeof setTimeout>>();
const commitTimers = new Map<string, ReturnType<typeof setTimeout>>();
const afkTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearAiTimer(roomId: string): void {
  const t = aiTimers.get(roomId);
  if (t) clearTimeout(t);
  aiTimers.delete(roomId);
}

function clearAfkTimer(roomId: string): void {
  const t = afkTimers.get(roomId);
  if (t) clearTimeout(t);
  afkTimers.delete(roomId);
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Human who must act right now (action turn or targeting), if any. */
function humanActorNeedingMove(room: Room): { id: string; name: string } | null {
  const eng = room.engine;
  if (!eng?.started) return null;
  const s = eng.getPublicState();
  if (
    s.phase === 'results' ||
    s.phase === 'waiting' ||
    s.phase === 'revealing' ||
    s.phase === 'resolving' ||
    s.phase === 'post_collect' ||
    s.phase === 'between_days' ||
    s.phase === 'day_intro'
  ) {
    return null;
  }
  if (s.phase === 'targeting' && s.targeting) {
    const p = s.players.find((x) => x.id === s.targeting!.playerId);
    if (p && !p.isAi) return { id: p.id, name: p.name };
    return null;
  }
  if (s.phase === 'action' && s.currentPlayerId) {
    const p = s.players.find((x) => x.id === s.currentPlayerId);
    if (p && !p.isAi) return { id: p.id, name: p.name };
  }
  return null;
}

function scheduleAfkWatch(room: Room): void {
  clearAfkTimer(room.id);
  const actor = humanActorNeedingMove(room);
  if (!actor) return;
  const expectedId = actor.id;
  const timer = setTimeout(() => {
    afkTimers.delete(room.id);
    dropIdleHuman(room, expectedId);
  }, AFK_MS);
  afkTimers.set(room.id, timer);
}

function dropIdleHuman(room: Room, playerId: string): void {
  if (!room.engine) return;
  const still = humanActorNeedingMove(room);
  if (!still || still.id !== playerId) {
    scheduleAfkWatch(room);
    return;
  }
  const seat = room.seats.find((s) => s.id === playerId);
  if (!seat || seat.isAi) {
    scheduleAfkWatch(room);
    return;
  }
  const sockId = seat.socketId;
  seat.isAi = true;
  seat.socketId = null;
  room.engine.setPlayerAi(playerId, true);
  room.engine.announce(`${seat.name} was dropped`, true);
  if (sockId) {
    const sock = io.sockets.sockets.get(sockId);
    if (sock) {
      const meta = socketMeta.get(sock.id);
      sock.leave(room.id);
      sock.join('lobby');
      if (meta) {
        meta.roomId = null;
        lobbyPlayers.set(meta.playerId, {
          id: meta.playerId,
          name: meta.name,
          socketId: sock.id,
        });
      }
      sock.emit('game:dropped', { name: seat.name, lobby: lobbySnapshot() });
    }
  }
  broadcastLobby();
  afterEngineMutation(room);
}

function emitGame(room: Room): void {
  if (!room.engine) return;
  const pub = room.engine.getPublicState();
  for (const seat of room.seats) {
    if (!seat.socketId) continue;
    io.to(seat.socketId).emit('game:state', {
      public: pub,
      hand: room.engine.getPrivateHand(seat.id),
      results: room.engine.getResults(),
    });
  }
  io.to(room.id).emit('game:public', pub);
  room.engine.takeAnimEvents();
}

function animWaitMs(anims: { type: string; playerId?: string }[]): number {
  const collects = anims.filter((a) => a.type === 'collect_noble').length;
  const deals = anims.filter((a) => a.type === 'deal_noble').length;
  const dumps = anims.filter((a) => a.type === 'discard_noble').length;
  const returns = anims.filter((a) => a.type === 'return_to_deck').length;
  const draws = anims.filter((a) => a.type === 'draw_action');
  const reveal = anims.some((a) => a.type === 'reveal_action');
  if (reveal) return 2800;
  if (collects > 0) return 2800 + (collects - 1) * 750;
  if (returns > 0) return 1400 + returns * 120 + (deals > 0 ? 2000 + deals * 300 : 0);
  if (dumps > 0) return 1400 + dumps * 320;
  if (deals > 0) return 2000 + deals * 300;
  if (draws.length > 1) {
    const players = new Set(draws.map((d) => d.playerId).filter(Boolean)).size;
    return 1400 + (draws.length - 1) * 110 + Math.max(0, players - 1) * 220;
  }
  const walks = anims.filter((a) => a.type === 'line_walk').length;
  if (walks > 0) return 1100 + (walks - 1) * 200;
  return 2000;
}

function afterEngineMutation(room: Room): void {
  if (!room.engine) return;
  const anims = room.engine.getPublicState().anims ?? [];
  emitGame(room);
  if (room.engine.getPublicState().phase === 'results') broadcastLobby();
  const wait = animWaitMs(anims);
  const pub = room.engine.getPublicState();
  const holdPick = pub.targeting?.picks?.length && pub.phase === 'targeting' ? 1000 : 0;
  const phase = pub.phase;
  if (phase === 'revealing') scheduleReveal(room, wait);
  else if (phase === 'resolving') scheduleCommit(room, wait);
  else if (phase === 'post_collect') schedulePostCollect(room, wait);
  else if (phase === 'between_days') scheduleBeginDay(room, wait);
  else if (phase === 'day_intro') scheduleStartDayPlay(room, wait);
  else scheduleAiPump(room, Math.max(wait, holdPick));
  scheduleAfkWatch(room);
}

function clearCommitTimer(roomId: string): void {
  const existing = commitTimers.get(roomId);
  if (existing) clearTimeout(existing);
  commitTimers.delete(roomId);
}

function scheduleReveal(room: Room, wait = 2800): void {
  clearAiTimer(room.id);
  clearCommitTimer(room.id);
  const timer = setTimeout(() => {
    commitTimers.delete(room.id);
    if (!room.engine) return;
    const res = room.engine.commitReveal();
    if (!res.ok) return;
    afterEngineMutation(room);
  }, wait);
  commitTimers.set(room.id, timer);
}

function scheduleCommit(room: Room, wait = 2000): void {
  clearAiTimer(room.id);
  clearCommitTimer(room.id);
  const timer = setTimeout(() => {
    commitTimers.delete(room.id);
    if (!room.engine) return;
    const res = room.engine.commitTurn();
    if (!res.ok) return;
    afterEngineMutation(room);
  }, wait);
  commitTimers.set(room.id, timer);
}

function schedulePostCollect(room: Room, wait = 1600): void {
  clearAiTimer(room.id);
  clearCommitTimer(room.id);
  const timer = setTimeout(() => {
    commitTimers.delete(room.id);
    if (!room.engine) return;
    const res = room.engine.completePostCollect();
    if (!res.ok) return;
    afterEngineMutation(room);
  }, wait);
  commitTimers.set(room.id, timer);
}

function scheduleBeginDay(room: Room, wait = 1200): void {
  clearAiTimer(room.id);
  clearCommitTimer(room.id);
  const timer = setTimeout(() => {
    commitTimers.delete(room.id);
    if (!room.engine) return;
    room.engine.beginNextDay();
    afterEngineMutation(room);
  }, wait);
  commitTimers.set(room.id, timer);
}

function scheduleStartDayPlay(room: Room, wait = 1200): void {
  clearAiTimer(room.id);
  clearCommitTimer(room.id);
  const timer = setTimeout(() => {
    commitTimers.delete(room.id);
    if (!room.engine) return;
    const res = room.engine.startDayPlay();
    if (!res.ok) return;
    afterEngineMutation(room);
  }, Math.max(wait, 2600));
  commitTimers.set(room.id, timer);
}

function scheduleAiPump(room: Room, wait = 1800): void {
  clearAiTimer(room.id);
  // Stale reveal/commit timers must not fire during AI targeting (e.g. Late Night).
  clearCommitTimer(room.id);
  if (!room.engine || !aiShouldAct(room.engine)) return;
  const timer = setTimeout(() => {
    aiTimers.delete(room.id);
    if (!room.engine) return;
    pumpAi(room.engine, 1);
    afterEngineMutation(room);
  }, wait);
  aiTimers.set(room.id, timer);
}

io.on('connection', (socket: Socket) => {
  socket.on('lobby:join', (payload: { name: string }, cb?: (r: unknown) => void) => {
    const name = (payload?.name || 'Player').trim().slice(0, 24) || 'Player';
    const playerId = randomUUID();
    lobbyPlayers.set(playerId, { id: playerId, name, socketId: socket.id });
    socketMeta.set(socket.id, { playerId, name, roomId: null });
    socket.join('lobby');
    broadcastLobby();
    cb?.({ ok: true, playerId, name, lobby: lobbySnapshot() });
  });

  socket.on(
    'game:create',
    (
      payload: { name?: string; maxPlayers?: number; houseRules?: HouseRules },
      cb?: (r: unknown) => void,
    ) => {
      const meta = socketMeta.get(socket.id);
      if (!meta) return cb?.({ ok: false, error: 'Join lobby first' });
      const roomId = randomUUID().slice(0, 8);
      const room: Room = {
        id: roomId,
        name: (payload?.name || `${meta.name}'s Cart`).slice(0, 40),
        hostId: meta.playerId,
        maxPlayers: Math.min(5, Math.max(1, payload?.maxPlayers ?? 5)),
        houseRules: payload?.houseRules ?? buildHouseRules({}),
        seats: [{ id: meta.playerId, name: meta.name, socketId: socket.id, isAi: false }],
        engine: null,
      };
      rooms.set(roomId, room);
      socket.leave('lobby');
      socket.join(roomId);
      meta.roomId = roomId;
      lobbyPlayers.delete(meta.playerId);
      broadcastLobby();
      cb?.({ ok: true, roomId, room: roomView(room) });
      io.to(roomId).emit('room:update', roomView(room));
    },
  );

  socket.on('game:create-test', (cb?: (r: unknown) => void) => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return cb?.({ ok: false, error: 'Join lobby first' });
    if (meta.roomId) return cb?.({ ok: false, error: 'Already in a room' });
    const roomId = randomUUID().slice(0, 8);
    const room: Room = {
      id: roomId,
      name: `${meta.name}'s Test`,
      hostId: meta.playerId,
      maxPlayers: 5,
      houseRules: buildHouseRules({ catalogDeal: true }),
      seats: [{ id: meta.playerId, name: meta.name, socketId: socket.id, isAi: false }],
      engine: null,
    };
    rooms.set(roomId, room);
    socket.leave('lobby');
    socket.join(roomId);
    meta.roomId = roomId;
    lobbyPlayers.delete(meta.playerId);
    const res = startRoomEngine(room, 4);
    if (!res.ok) {
      rooms.delete(roomId);
      meta.roomId = null;
      socket.leave(roomId);
      socket.join('lobby');
      lobbyPlayers.set(meta.playerId, { id: meta.playerId, name: meta.name, socketId: socket.id });
      return cb?.({ ok: false, error: res.error });
    }
    broadcastLobby();
    afterEngineMutation(room);
    cb?.({ ok: true, roomId, room: roomView(room) });
    io.to(roomId).emit('room:update', roomView(room));
  });

  socket.on('game:join', (payload: { roomId: string }, cb?: (r: unknown) => void) => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return cb?.({ ok: false, error: 'Join lobby first' });
    const room = rooms.get(payload.roomId);
    if (!room) return cb?.({ ok: false, error: 'Game not found' });

    if (room.engine?.started) {
      const ended = room.engine.getPublicState().phase === 'results';
      if (ended) return cb?.({ ok: false, error: 'Game already finished' });
      const seat = room.seats.find((s) => !s.socketId && namesMatch(s.name, meta.name));
      if (!seat) {
        return cb?.({ ok: false, error: 'No open seat matching your name' });
      }
      lobbyPlayers.delete(meta.playerId);
      meta.playerId = seat.id;
      meta.roomId = room.id;
      seat.socketId = socket.id;
      seat.isAi = false;
      room.engine.setPlayerAi(seat.id, false);
      room.engine.setConnected(seat.id, true);
      socket.leave('lobby');
      socket.join(room.id);
      broadcastLobby();
      emitGame(room);
      scheduleAfkWatch(room);
      io.to(room.id).emit('room:update', roomView(room));
      return cb?.({ ok: true, roomId: room.id, room: roomView(room), playerId: seat.id });
    }

    if (room.seats.length >= room.maxPlayers) return cb?.({ ok: false, error: 'Game full' });
    if (room.seats.some((s) => s.id === meta.playerId)) {
      return cb?.({ ok: true, roomId: room.id, room: roomView(room), playerId: meta.playerId });
    }
    room.seats.push({ id: meta.playerId, name: meta.name, socketId: socket.id, isAi: false });
    socket.leave('lobby');
    socket.join(room.id);
    meta.roomId = room.id;
    lobbyPlayers.delete(meta.playerId);
    broadcastLobby();
    io.to(room.id).emit('room:update', roomView(room));
    cb?.({ ok: true, roomId: room.id, room: roomView(room), playerId: meta.playerId });
  });

  socket.on('game:leave', (cb?: (r: unknown) => void) => {
    leaveRoom(socket);
    cb?.({ ok: true, lobby: lobbySnapshot() });
  });

  socket.on('game:cancel', (cb?: (r: unknown) => void) => {
    const meta = socketMeta.get(socket.id);
    if (!meta?.roomId) return cb?.({ ok: false, error: 'Not in a room' });
    const room = rooms.get(meta.roomId);
    if (!room) return cb?.({ ok: false, error: 'Room missing' });
    if (meta.playerId !== room.hostId) return cb?.({ ok: false, error: 'Only host can cancel' });
    if (room.engine?.started) return cb?.({ ok: false, error: 'Game already started' });
    cancelWaitingRoom(room, socket.id);
    cb?.({ ok: true, lobby: lobbySnapshot() });
  });

  socket.on('game:add-ai', (cb?: (r: unknown) => void) => {
    const meta = socketMeta.get(socket.id);
    if (!meta?.roomId) return cb?.({ ok: false, error: 'Not in a room' });
    const room = rooms.get(meta.roomId);
    if (!room) return cb?.({ ok: false, error: 'Room missing' });
    if (meta.playerId !== room.hostId) return cb?.({ ok: false, error: 'Only host can add AI' });
    if (room.engine?.started) return cb?.({ ok: false, error: 'Already started' });
    if (room.seats.length >= room.maxPlayers) return cb?.({ ok: false, error: 'Game full' });
    const name = pickAiName(room.seats.map((s) => s.name));
    room.seats.push({ id: `ai_${randomUUID().slice(0, 8)}`, name, socketId: null, isAi: true });
    broadcastLobby();
    io.to(room.id).emit('room:update', roomView(room));
    cb?.({ ok: true, room: roomView(room) });
  });

  socket.on('game:remove-ai', (payload: { playerId?: string }, cb?: (r: unknown) => void) => {
    const meta = socketMeta.get(socket.id);
    if (!meta?.roomId) return cb?.({ ok: false, error: 'Not in a room' });
    const room = rooms.get(meta.roomId);
    if (!room) return cb?.({ ok: false, error: 'Room missing' });
    if (meta.playerId !== room.hostId) return cb?.({ ok: false, error: 'Only host can remove AI' });
    if (room.engine?.started) return cb?.({ ok: false, error: 'Already started' });
    const id = payload?.playerId;
    const seat = room.seats.find((s) => s.id === id);
    if (!seat?.isAi) return cb?.({ ok: false, error: 'No AI in that seat' });
    room.seats = room.seats.filter((s) => s.id !== id);
    broadcastLobby();
    io.to(room.id).emit('room:update', roomView(room));
    cb?.({ ok: true, room: roomView(room) });
  });

  socket.on(
    'game:start',
    (payload: { aiCount?: number }, cb?: (r: unknown) => void) => {
      const meta = socketMeta.get(socket.id);
      if (!meta?.roomId) return cb?.({ ok: false, error: 'Not in a room' });
      const room = rooms.get(meta.roomId);
      if (!room) return cb?.({ ok: false, error: 'Room missing' });
      if (meta.playerId !== room.hostId) return cb?.({ ok: false, error: 'Only host can start' });
      if (room.engine?.started) return cb?.({ ok: false, error: 'Already started' });
      const extraAi = Math.max(0, Math.min(4, payload?.aiCount ?? 0));
      const res = startRoomEngine(room, extraAi);
      if (!res.ok) return cb?.({ ok: false, error: res.error });
      broadcastLobby();
      afterEngineMutation(room);
      cb?.({ ok: true });
    },
  );

  socket.on('game:play', (payload: { cardInstanceId: string }, cb?: (r: unknown) => void) => {
    const room = roomFor(socket);
    if (!room?.engine) return cb?.({ ok: false, error: 'No game' });
    const meta = socketMeta.get(socket.id)!;
    const res = room.engine.playCard(meta.playerId, payload.cardInstanceId);
    if (!res.ok) return cb?.({ ok: false, error: res.error });
    afterEngineMutation(room);
    cb?.({ ok: true });
  });

  socket.on('game:skip', (cb?: (r: unknown) => void) => {
    const room = roomFor(socket);
    if (!room?.engine) return cb?.({ ok: false, error: 'No game' });
    const meta = socketMeta.get(socket.id)!;
    const res = room.engine.skipAction(meta.playerId);
    if (!res.ok) return cb?.({ ok: false, error: res.error });
    afterEngineMutation(room);
    cb?.({ ok: true });
  });

  socket.on('game:target-preview', (payload: { picks: string[] }, cb?: (r: unknown) => void) => {
    const room = roomFor(socket);
    if (!room?.engine) return cb?.({ ok: false, error: 'No game' });
    const meta = socketMeta.get(socket.id)!;
    const res = room.engine.previewTargets(meta.playerId, payload.picks ?? []);
    if (!res.ok) return cb?.({ ok: false, error: res.error });
    emitGame(room);
    scheduleAfkWatch(room);
    cb?.({ ok: true });
  });

  socket.on('game:targets', (payload: { picks: string[] }, cb?: (r: unknown) => void) => {
    const room = roomFor(socket);
    if (!room?.engine) return cb?.({ ok: false, error: 'No game' });
    const meta = socketMeta.get(socket.id)!;
    const res = room.engine.submitTargets(meta.playerId, payload.picks ?? []);
    if (!res.ok) return cb?.({ ok: false, error: res.error });
    afterEngineMutation(room);
    cb?.({ ok: true });
  });

  socket.on('game:discard-front', (payload: { frontInstanceId: string }, cb?: (r: unknown) => void) => {
    const room = roomFor(socket);
    if (!room?.engine) return cb?.({ ok: false, error: 'No game' });
    const meta = socketMeta.get(socket.id)!;
    const res = room.engine.discardFrontCard(meta.playerId, payload.frontInstanceId);
    if (!res.ok) return cb?.({ ok: false, error: res.error });
    afterEngineMutation(room);
    cb?.({ ok: true });
  });

  socket.on('game:exit', (cb?: (r: unknown) => void) => {
    leaveRoom(socket);
    cb?.({ ok: true, lobby: lobbySnapshot() });
  });

  socket.on('disconnect', () => {
    const meta = socketMeta.get(socket.id);
    if (!meta) return;
    if (meta.roomId) {
      const room = rooms.get(meta.roomId);
      if (room) {
        const ended = room.engine?.getPublicState().phase === 'results';
        const seat = room.seats.find((s) => s.id === meta.playerId);
        if (seat) seat.socketId = null;
        room.engine?.setConnected(meta.playerId, false);
        if (ended) {
          room.seats = room.seats.filter((s) => s.id !== meta.playerId);
          if (!humanSeats(room).length || maybeDestroyFinishedRoom(room)) {
            /* room gone */
          } else if (room.hostId === meta.playerId) {
            room.hostId = humanSeats(room)[0]?.id ?? room.seats[0].id;
          }
        } else if (room.engine?.started) {
          emitGame(room);
          scheduleAfkWatch(room);
        } else {
          room.seats = room.seats.filter((s) => s.id !== meta.playerId);
          if (!humanSeats(room).length) destroyRoom(room);
          else {
            if (room.hostId === meta.playerId) {
              room.hostId = humanSeats(room)[0]?.id ?? room.seats[0].id;
            }
            io.to(room.id).emit('room:update', roomView(room));
          }
        }
      }
    }
    lobbyPlayers.delete(meta.playerId);
    socketMeta.delete(socket.id);
    broadcastLobby();
  });
});

function startRoomEngine(room: Room, extraAi = 0): { ok: boolean; error?: string } {
  if (room.engine?.started) return { ok: false, error: 'Already started' };
  const engine = new GuillotineEngine(room.id, room.hostId, room.maxPlayers, room.houseRules);
  for (const s of room.seats) engine.addPlayer(s.id, s.name, !!s.isAi);
  const add = Math.max(0, extraAi);
  if (add) engine.addAiPlayers(add);
  for (const p of engine.players) {
    if (p.isAi && !room.seats.some((s) => s.id === p.id)) {
      room.seats.push({ id: p.id, name: p.name, socketId: null, isAi: true });
    }
  }
  const res = engine.start();
  if (!res.ok) return { ok: false, error: res.error };
  room.engine = engine;
  return { ok: true };
}

function roomFor(socket: Socket): Room | null {
  const meta = socketMeta.get(socket.id);
  if (!meta?.roomId) return null;
  return rooms.get(meta.roomId) ?? null;
}

function roomView(room: Room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    houseRules: room.houseRules,
    started: !!room.engine?.started,
    players: room.seats.map((s) => ({
      id: s.id,
      name: s.name,
      connected: !!s.socketId,
      isAi: !!s.isAi,
    })),
  };
}

function returnSeatToLobby(seat: Seat, roomId: string): void {
  if (seat.isAi || !seat.socketId) return;
  const sock = io.sockets.sockets.get(seat.socketId);
  if (!sock) return;
  const meta = socketMeta.get(sock.id);
  sock.leave(roomId);
  sock.join('lobby');
  if (meta) {
    meta.roomId = null;
    lobbyPlayers.set(meta.playerId, {
      id: meta.playerId,
      name: meta.name,
      socketId: sock.id,
    });
  }
}

function cancelWaitingRoom(room: Room, hostSocketId: string): void {
  io.to(room.id).except(hostSocketId).emit('room:cancelled');
  for (const seat of humanSeats(room)) {
    returnSeatToLobby(seat, room.id);
  }
  destroyRoom(room);
  broadcastLobby();
}

function leaveRoom(socket: Socket): void {
  const meta = socketMeta.get(socket.id);
  if (!meta?.roomId) {
    if (meta) {
      lobbyPlayers.set(meta.playerId, {
        id: meta.playerId,
        name: meta.name,
        socketId: socket.id,
      });
      socket.join('lobby');
      broadcastLobby();
    }
    return;
  }
  const room = rooms.get(meta.roomId);
  socket.leave(meta.roomId);
  if (room) {
    const ended = room.engine?.getPublicState().phase === 'results';
    if (room.engine?.started && !ended) {
      const seat = room.seats.find((s) => s.id === meta.playerId);
      if (seat) seat.socketId = null;
      room.engine.setConnected(meta.playerId, false);
      emitGame(room);
      scheduleAfkWatch(room);
    } else {
      room.seats = room.seats.filter((s) => s.id !== meta.playerId);
      if (ended) room.engine?.setConnected(meta.playerId, false);
      if (!humanSeats(room).length) destroyRoom(room);
      else {
        if (room.hostId === meta.playerId) {
          room.hostId = humanSeats(room)[0]?.id ?? room.seats[0].id;
        }
        if (!maybeDestroyFinishedRoom(room)) {
          io.to(room.id).emit('room:update', roomView(room));
        }
      }
    }
  }
  meta.roomId = null;
  lobbyPlayers.set(meta.playerId, {
    id: meta.playerId,
    name: meta.name,
    socketId: socket.id,
  });
  socket.join('lobby');
  broadcastLobby();
}

httpServer.listen(PORT, () => {
  console.log(`Guillotine 2028 server on http://localhost:${PORT}`);
});
