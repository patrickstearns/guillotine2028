import type { HouseRules } from './types.js';

export const NO_PREMATURE_ENDINGS_TOOLTIP =
  'Stephen Miller (Naziferatu) keeps his card but no longer ends the day when collected. Spoilsport is removed from the action deck.';

export function buildHouseRules(opts: { noPrematureEndings?: boolean; catalogDeal?: boolean }): HouseRules {
  const parts = ['Standard'];
  if (opts.noPrematureEndings) parts.push('No Premature Endings');
  if (opts.catalogDeal) parts.push('Test catalog');
  const notes: string[] = [];
  if (opts.noPrematureEndings) {
    notes.push('No Premature Endings: Miller cannot end the day; Spoilsport is not in the deck.');
  }
  if (opts.catalogDeal) {
    notes.push('Dev: unique action cycle for the human player.');
  }
  if (!notes.length) notes.push('Standard rules only.');
  return {
    label: parts.join(' · '),
    notes: notes.join(' '),
    noPrematureEndings: opts.noPrematureEndings || undefined,
    catalogDeal: opts.catalogDeal || undefined,
  };
}

export function nobleAbilitySuppressed(defId: string, ability: string, rules?: HouseRules): boolean {
  return !!rules?.noPrematureEndings && defId.replace(/_\d+$/, '') === 'miller' && ability === 'end_day';
}
