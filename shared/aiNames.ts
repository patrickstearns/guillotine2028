/** Display names for AI seats. Unused names are shuffled so each add is random. */
export const AI_SEAT_NAMES = [
  'Blade Bot',
  'Cart Algorithm',
  'GuillotineGPT',
  'Redactor-9000',
  'Pardon Denied',
  'Headcount',
  'Pocket Veto',
  'Spin Cycle',
  'Whip Count',
  'Cloture',
  'Gavel.exe',
  'Off the Record',
  'Briefing Room',
  'Crowd Control',
  'Drop Box',
  'Talking Point',
  'Sergeant at Arms',
  'Embargo',
  'Deep Background',
  'Floor Manager',
  'Motion to Censure',
  'Press Pool',
  'Filibuster',
  'Leak Dump',
] as const;

export function pickAiName(usedNames: Iterable<string>): string {
  const used = new Set(usedNames);
  const free = AI_SEAT_NAMES.filter((n) => !used.has(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)]!;
  let n = used.size + 1;
  while (used.has(`AI ${n}`)) n += 1;
  return `AI ${n}`;
}
