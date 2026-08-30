import type { LobbySnapshot } from '../net';

export function renderLobby(lobby: LobbySnapshot, myName: string): string {
  const myKey = myName.trim().toLowerCase();
  const games = lobby.games
    .map((g) => {
      const canRejoin =
        g.started && (g.rejoinNames ?? []).some((n) => n.trim().toLowerCase() === myKey);
      const full = g.playerCount >= g.maxPlayers;
      const disabled = g.started ? !canRejoin : full;
      const label = canRejoin ? 'Rejoin' : g.started ? 'In Progress' : full ? 'Full' : 'Join';
      return `
        <li class="lobby-game">
          <div>
            <strong>${escape(g.name)}</strong>
            <span class="muted">${g.playerCount}/${g.maxPlayers} · ${escape(g.hostName)} · ${escape(g.houseRulesLabel)}${g.started ? ' · live' : ''}</span>
          </div>
          <button type="button" data-join="${g.id}" ${disabled ? 'disabled' : ''}>${label}</button>
        </li>
      `;
    })
    .join('');

  const players =
    lobby.players
      .map((p) => {
        const region = p.region ? `<span class="muted lobby-region">${escape(p.region)}</span>` : '';
        return `<li class="lobby-player"><strong>${escape(p.name)}</strong>${region}</li>`;
      })
      .join('') || '<li class="muted">No one else here yet</li>';

  return `
    <div class="screen lobby">
      <header class="lobby-header">
        <img class="lobby-logo" src="/assets/logo-guillotine-2028.png" alt="Guillotine 2028" />
        <h1>Lobby</h1>
        <p class="muted">Signed in as <strong>${escape(myName)}</strong></p>
      </header>
      <div class="lobby-grid">
        <section class="panel">
          <h2>Players here</h2>
          <ul class="plain-list">${players}</ul>
        </section>
        <section class="panel">
          <h2>Open games</h2>
          <ul class="game-list">${games || '<li class="muted">No games yet — start one.</li>'}</ul>
        </section>
        <section class="panel create-panel">
          <h2>Start a game</h2>
          <label>Table name<input id="game-name" maxlength="40" placeholder="${escape(myName)}'s Cart" /></label>
          <label>Max players
            <select id="max-players">
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5" selected>5</option>
            </select>
          </label>
          <div class="house-rules-box">
            <h3>House rules</h3>
            <label class="house-rule-option" title="Stephen Miller (Naziferatu) keeps his card but no longer ends the day when collected. Spoilsport is removed from the action deck.">
              <input type="checkbox" id="no-premature-endings" />
              No Premature Endings
            </label>
          </div>
          <div class="create-actions">
            <button type="button" id="create-game" class="primary">Create game</button>
            <button type="button" id="create-test-game">Create test game</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
