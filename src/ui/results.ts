import type { PlayerResult } from '../../shared/types';
import { actionCardHtml, nobleCardHtml } from './cards';

const TALLY_START_MS = 180;
const TALLY_STEP_MS = 320;
/** Must match `.toast` animation duration in styles.css */
const WINNER_TOAST_MS = 2400;

export function renderResults(results: PlayerResult[]): string {
  const rows = results
    .map(
      (r, i) => `
        <article class="result-card ${i === 0 ? 'winner' : ''}" data-player="${r.playerId}">
          <header>
            <span class="place">#${i + 1}</span>
            <h2>${escape(r.name)}${r.isAi ? ' (AI)' : ''}</h2>
            <div class="final" data-final="0">0</div>
          </header>
          <div class="tally-stack">
            ${r.tally
              .map((line, idx) => {
                const card =
                  line.kind === 'noble' && line.defId && line.instanceId
                    ? nobleCardHtml({ instanceId: line.instanceId, defId: line.defId }, { compact: true })
                    : line.kind === 'action' && line.defId && line.instanceId
                      ? actionCardHtml({ instanceId: line.instanceId, defId: line.defId }, { compact: true })
                      : `<div class="tally-penalty">${escape(line.label)}</div>`;
                const signed =
                  line.points > 0 ? `+${line.points}` : line.points < 0 ? `−${Math.abs(line.points)}` : '0';
                return `<div class="tally-row ${line.kind === 'action' ? 'tally-played' : ''}" data-pts="${line.points}" data-i="${idx}" style="--i:${idx}">
                  ${card}
                  <span class="tally-pts ${line.points < 0 ? 'neg' : line.points > 0 ? 'pos' : ''}">${signed}</span>
                </div>`;
              })
              .join('')}
          </div>
        </article>`,
    )
    .join('');

  return `
    <div class="screen results">
      <header>
        <p class="eyebrow">Guillotine 2028</p>
        <h1>Final Tally</h1>
      </header>
      <div class="results-grid results-tally">${rows}</div>
      <div class="results-actions" hidden>
        <button type="button" id="exit-lobby" class="primary">Exit to lobby</button>
      </div>
    </div>
  `;
}

export function startTally(root: HTMLElement, results: PlayerResult[]): void {
  const cards = [...root.querySelectorAll('.result-card')];
  const exitActions = root.querySelector('.results-actions') as HTMLElement | null;
  const winner = results[0];
  const max = Math.max(0, ...cards.map((c) => c.querySelectorAll('.tally-row').length));
  cards.forEach((card) => {
    card.querySelectorAll('.tally-row').forEach((row) => row.classList.remove('show'));
  });
  let step = 0;
  const layoutFans = () => {
    cards.forEach((card) => {
      const fan = card.querySelector('.tally-stack') as HTMLElement | null;
      if (!fan) return;
      const shown = [...fan.querySelectorAll('.tally-row.show')] as HTMLElement[];
      const n = shown.length;
      if (!n) return;
      const avail = fan.clientWidth;
      const sample = shown[0];
      const cardW = sample.getBoundingClientRect().width || 55;
      const peek = 26;
      const overlap =
        n > 1 ? Math.min(cardW - peek, Math.max(0, (cardW * n - avail) / (n - 1))) : 0;
      shown.forEach((row, i) => {
        row.style.marginLeft = i === 0 ? '0px' : `${-overlap}px`;
        row.style.zIndex = String(i + 1);
      });
    });
  };
  const showWinnerToast = () => {
    if (!winner) {
      exitActions?.removeAttribute('hidden');
      return;
    }
    const toast = document.createElement('div');
    toast.className = 'toast results-winner-toast';
    toast.textContent = `${winner.name} Wins!`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    root.appendChild(toast);
    const revealExit = () => {
      toast.remove();
      exitActions?.removeAttribute('hidden');
    };
    toast.addEventListener('animationend', revealExit, { once: true });
    window.setTimeout(revealExit, WINNER_TOAST_MS + 120);
  };
  const tick = () => {
    cards.forEach((card) => {
      const row = card.querySelector(`.tally-row[data-i="${step}"]`) as HTMLElement | null;
      const totalEl = card.querySelector('.final') as HTMLElement | null;
      if (!row || !totalEl) return;
      row.classList.add('show');
      const next = Number(totalEl.dataset.final ?? '0') + Number(row.dataset.pts ?? '0');
      totalEl.dataset.final = String(next);
      totalEl.textContent = String(next);
    });
    layoutFans();
    step += 1;
    if (step < max) window.setTimeout(tick, TALLY_STEP_MS);
    else window.setTimeout(showWinnerToast, TALLY_STEP_MS);
  };
  window.setTimeout(tick, TALLY_START_MS);
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
