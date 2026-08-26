import { actionById, nobleById, SUIT_COLOR } from '../../shared/cards';
import { nobleAbilitySuppressed } from '../../shared/houseRules';
import type { ActionInstance, HouseRules, NobleInstance } from '../../shared/types';

function actionArtSrc(defId: string): string {
  const base = defId.replace(/_\d+$/, '');
  return `/assets/actions/action-${base}.png`;
}

export function nobleCardHtml(
  n: NobleInstance,
  opts?: {
    compact?: boolean;
    selected?: boolean;
    selectable?: boolean;
    frightened?: boolean;
    arriving?: boolean;
    houseRules?: HouseRules;
  },
): string {
  const def = nobleById(n.defId);
  if (!def) return '';
  const color = SUIT_COLOR[def.suit] ?? '#888';
  const portraitId = def.id.replace(/_\d+$/, '');
  const png = opts?.frightened
    ? `/assets/portraits/${portraitId}-fear.png`
    : `/assets/portraits/${portraitId}.png`;
  const fallback = `/assets/portraits/${portraitId}.png`;
  const svg = `/assets/portraits/${portraitId}.svg`;
  const cls = [
    'card',
    'card-noble',
    opts?.compact ? 'compact' : '',
    opts?.selected ? 'selected' : '',
    opts?.selectable ? 'selectable' : '',
    opts?.frightened ? 'frightened' : '',
    opts?.arriving ? 'await-arrive' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const rules =
    def.ability !== 'none' &&
    def.blurb.trim() &&
    !nobleAbilitySuppressed(def.id, def.ability, opts?.houseRules)
      ? def.blurb
      : '';
  return `
    <article class="${cls}" data-instance="${n.instanceId}" data-kind="noble" data-suit="${def.suit}" style="--suit:${color}">
      <header class="card-head">
        <h3 class="card-title">${escapeHtml(def.name)}</h3>
        <div class="card-points ${def.points < 0 ? 'neg' : ''}">${fmtPts(def)}</div>
      </header>
      <div class="card-art" aria-hidden="true">
        <img src="${png}" alt="" data-fb="${opts?.frightened ? fallback : svg}" data-svg="${svg}" onerror="if(!this.dataset.step){this.dataset.step='1';this.src=this.dataset.fb}else{this.onerror=null;this.src=this.dataset.svg}" />
      </div>
      ${rules ? `<p class="card-blurb">${escapeHtml(rules)}</p>` : ''}
    </article>
  `;
}

function fmtPts(def: { points: number; ability: string }): string {
  if (def.ability === 'palace_guard') return '★';
  if (def.ability === 'tragic_figure') return '−1×';
  return `${def.points > 0 ? '+' : ''}${def.points}`;
}

export function actionCardHtml(
  a: ActionInstance,
  opts?: { selected?: boolean; compact?: boolean; selectable?: boolean; unplayable?: boolean; arriving?: boolean },
): string {
  const def = actionById(a.defId);
  if (!def) return '';
  const cls = [
    'card',
    'card-action',
    opts?.compact ? 'compact' : '',
    opts?.selected ? 'selected' : '',
    opts?.selectable ? 'selectable' : '',
    opts?.unplayable ? 'unplayable' : '',
    opts?.arriving ? 'await-arrive' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const art = `<img src="${actionArtSrc(a.defId)}" alt="" onerror="this.onerror=null;this.src='/assets/card-action-motif.svg'" />`;
  return `
    <article class="${cls}" data-instance="${a.instanceId}" data-kind="action" style="--suit:#7c2d12">
      <header class="card-head">
        <h3 class="card-title">${escapeHtml(def.name)}</h3>
      </header>
      <div class="card-art action-art" aria-hidden="true">${art}</div>
      <p class="card-blurb">${escapeHtml(def.text)}</p>
    </article>
  `;
}

export function skipCardHtml(): string {
  return `
    <article class="card card-skip" data-instance="skip-action" data-kind="skip">
      <header class="card-head">
        <h3 class="card-title">Don't play a card</h3>
      </header>
      <p class="card-blurb">Pass and collect the next figure.</p>
    </article>
  `;
}

export function cardBackHtml(kind: 'action' | 'noble' = 'action', label = ''): string {
  const src = kind === 'noble' ? '/assets/card-back-noble.png' : '/assets/card-back-action.png';
  return `
    <div class="card card-back card-back-${kind}">
      <img src="${src}" alt="Card back" />
      ${label ? `<span>${escapeHtml(label)}</span>` : ''}
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
