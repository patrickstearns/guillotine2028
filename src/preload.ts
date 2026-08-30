import { ACTIONS, NOBLES } from '../shared/cards';

const EXTRA_ASSETS = [
  '/assets/card-back-action.png',
  '/assets/card-back-noble.png',
  '/assets/card-action-motif.svg',
  '/assets/executioner-cutout.png',
  '/assets/executioner.png',
  '/assets/logo-guillotine-2028.png',
  '/assets/protest-crowd.png',
  '/assets/patterns/executive.svg',
  '/assets/patterns/legislative.svg',
  '/assets/patterns/judicial.svg',
  '/assets/patterns/media.svg',
  '/assets/patterns/martyr.svg',
];

function cardAssetUrls(): string[] {
  const urls = new Set<string>(EXTRA_ASSETS);
  for (const n of NOBLES) {
    const id = n.id.replace(/_\d+$/, '');
    urls.add(`/assets/portraits/${id}.png`);
    urls.add(`/assets/portraits/${id}-fear.png`);
  }
  for (const a of ACTIONS) {
    const id = a.id.replace(/_\d+$/, '');
    urls.add(`/assets/actions/action-${id}.png`);
  }
  return [...urls];
}

function loadOne(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

/** Warm the browser cache for all card / UI images. Safe to call once at startup. */
export function preloadCardAssets(concurrency = 8): Promise<void> {
  const queue = cardAssetUrls();
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (i < queue.length) {
      const src = queue[i++]!;
      await loadOne(src);
    }
  });
  return Promise.all(workers).then(() => undefined);
}
