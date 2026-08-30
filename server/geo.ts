import type { Socket } from 'socket.io';

const cache = new Map<string, string>();

function normalizeIp(raw: string): string {
  return raw.trim().replace(/^::ffff:/, '');
}

/** Client IP from Socket.IO handshake (honors X-Forwarded-For when proxied). */
export function clientIp(socket: Socket): string {
  const xf = socket.handshake.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return normalizeIp(xf.split(',')[0] ?? '');
  }
  if (Array.isArray(xf) && xf[0]) {
    return normalizeIp(xf[0].split(',')[0] ?? '');
  }
  return normalizeIp(socket.handshake.address ?? '');
}

function isPrivateOrLocal(ip: string): boolean {
  if (!ip) return true;
  if (ip === '127.0.0.1' || ip === '::1') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true;
  return false;
}

/**
 * Coarse region label from IP (e.g. "California, US"). Cached. Local/private → "Local".
 */
export async function lookupRegion(ip: string): Promise<string> {
  const clean = normalizeIp(ip);
  if (isPrivateOrLocal(clean)) return 'Local';
  const hit = cache.get(clean);
  if (hit) return hit;

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,country,regionName,countryCode`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    const data = (await res.json()) as {
      status: string;
      country?: string;
      regionName?: string;
      countryCode?: string;
    };
    if (data.status !== 'success') {
      cache.set(clean, 'Unknown');
      return 'Unknown';
    }
    const label =
      data.regionName && data.countryCode
        ? `${data.regionName}, ${data.countryCode}`
        : data.country || data.countryCode || 'Unknown';
    cache.set(clean, label);
    return label;
  } catch {
    cache.set(clean, 'Unknown');
    return 'Unknown';
  }
}
