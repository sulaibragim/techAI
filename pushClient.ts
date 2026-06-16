// Browser-side Web Push: ask permission, subscribe via the service worker, and
// register the subscription with the backend. The VAPID public key is fetched from
// the server so the browser always matches whatever is configured on Railway.
import { API_BASE } from './backendUrl';
import { authHeaders } from './apiClient';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export type PushPermission = 'unsupported' | 'granted' | 'denied' | 'default';

export function pushPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported';
  const p = Notification.permission;
  return p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
}

export async function isSubscribed(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/push/public-key`);
    if (!res.ok) return null;
    const { key, enabled } = await res.json();
    return enabled && key ? (key as string) : null;
  } catch {
    return null;
  }
}

export type EnableReason = PushPermission | 'server-disabled' | 'subscribe-failed' | 'save-failed';
export interface EnableResult { ok: boolean; reason?: EnableReason; }

// Must be called from a user gesture (a tap) — iOS requires it for the permission prompt.
export async function enablePush(): Promise<EnableResult> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'default' };

  const key = await fetchPublicKey();
  if (!key) return { ok: false, reason: 'server-disabled' };

  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }
    const res = await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!res.ok) return { ok: false, reason: 'save-failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'subscribe-failed' };
  }
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch(`${API_BASE}/api/push/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  } catch {
    /* ignore */
  }
}

export async function sendTestPush(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/push/test`, { method: 'POST', headers: { ...authHeaders() } });
    return res.ok;
  } catch {
    return false;
  }
}
