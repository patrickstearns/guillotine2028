import type { RoomView } from '../net';

export function renderWaiting(room: RoomView, myId: string): string {
  const isHost = room.hostId === myId;
  const filled = room.players;
  const empty = Math.max(0, room.maxPlayers - filled.length);

  const filledTiles = filled
    .map((p) => {
      const ai = !!p.isAi;
      const inner = `
        <span class="dot ${p.connected || ai ? 'on' : ''}"></span>
        <strong>${escape(p.name)}</strong>
        ${p.id === room.hostId ? '<em>host</em>' : ai ? '<em>AI</em>' : ''}`;
      if (ai && isHost) {
        return `<li><button type="button" class="seat-tile ai" data-remove-ai="${p.id}" title="Remove AI">${inner}</button></li>`;
      }
      return `<li class="seat-tile ${p.id === myId ? 'me' : ''} ${ai ? 'ai' : ''}">${inner}</li>`;
    })
    .join('');

  const ghostTiles = Array.from({ length: empty }, (_, i) => {
    const label = i === 0 ? 'Add AI Player' : '';
    if (isHost) {
      return `<li><button type="button" class="seat-tile ghost" data-add-ai>${label}</button></li>`;
    }
    return `<li class="seat-tile ghost">${label}</li>`;
  }).join('');

  return `
    <div class="screen waiting">
      <div class="waiting-inner">
        <header class="waiting-header">
          <img class="lobby-logo" src="/assets/logo-guillotine-2028.png" alt="Guillotine 2028" />
          <div class="waiting-header-row">
            <h1>${escape(room.name)}</h1>
            <button type="button" id="leave-room" class="ghost">Leave</button>
          </div>
        </header>
        <ul class="seat-tiles" style="--seat-cols:${room.maxPlayers}">${filledTiles}${ghostTiles}</ul>
        ${
          isHost
            ? `<button type="button" id="start-game" class="primary start-game-btn">Begin the Revolution</button>`
            : `<p class="muted waiting-host-msg">Waiting for the host to start.</p>`
        }
        <section class="panel">
          <div class="house-rules-box">
            <h3>House rules</h3>
            <p>${escape(room.houseRules.notes)}</p>
          </div>
        </section>
      </div>
    </div>
  `;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
