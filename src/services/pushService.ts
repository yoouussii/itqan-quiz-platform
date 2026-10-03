/**
 * إشعارات الجوال (Web Push) وتثبيت الموقع كتطبيق.
 * الجهاز يشترك بالمفتاح العام (من الإعدادات)، ويُحفظ اشتراكه في push_subscriptions (017).
 * عند تسجيل الخروج يُلغى اشتراك الجهاز حتى لا تصل إشعارات المستخدم السابق لجهاز مشترك.
 */
import { supabase } from './supabase';
import { safe } from './remote';

export type PushStatus = 'unsupported' | 'needs_install' | 'not_configured' | 'denied' | 'on' | 'off';

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
/** iPhone/iPad: الإشعارات تعمل فقط بعد إضافة الموقع للشاشة الرئيسية */
export const iosNeedsInstall = () => isIOS() && !isStandalone();
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function keyBytes(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const registration = async () => (supported() ? navigator.serviceWorker.getRegistration() : undefined);

export async function pushStatus(vapidKey: string): Promise<PushStatus> {
  if (iosNeedsInstall()) return 'needs_install';
  if (!supported()) return 'unsupported';
  if (!vapidKey) return 'not_configured';
  if (Notification.permission === 'denied') return 'denied';
  const sub = await (await registration())?.pushManager.getSubscription();
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush(userId: string, vapidKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    return await subscribeDevice(userId, vapidKey);
  } catch (e: any) {
    // مثل: خدمة الإشعارات غير متاحة على هذه الشبكة، أو رفض المتصفح
    return { ok: false, error: /denied/i.test(e?.message || '') && Notification.permission === 'denied' ? 'denied' : e?.message || 'error' };
  }
}

async function subscribeDevice(userId: string, vapidKey: string): Promise<{ ok: boolean; error?: string }> {
  if (!supported() || !vapidKey) return { ok: false, error: 'unsupported' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'denied' };
  const reg = (await registration()) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // مفتاح مختلف (أعيد توليده): اشتراك جديد
  const current = sub?.options?.applicationServerKey;
  if (sub && current && btoa(String.fromCharCode(...new Uint8Array(current))) !== btoa(String.fromCharCode(...keyBytes(vapidKey)))) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidKey) as BufferSource });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const res = await safe(() => supabase.from('push_subscriptions').upsert({
    endpoint: json.endpoint, user_id: userId, p256dh: json.keys.p256dh, auth: json.keys.auth, user_agent: navigator.userAgent.slice(0, 200),
  }, { onConflict: 'endpoint' }) as any);
  return { ok: res.ok, error: res.error };
}

/** إيقاف الإشعارات على هذا الجهاز (وعند تسجيل الخروج) */
export async function disablePush(): Promise<void> {
  try {
    const sub = await (await registration())?.pushManager.getSubscription();
    if (!sub) return;
    await safe(() => supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) as any);
    await sub.unsubscribe();
  } catch {
    /* ignore */
  }
}

// ---- تثبيت الموقع كتطبيق (أندرويد وكروم على الحاسب) ----
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installEvent = e as InstallEvent;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    listeners.forEach((f) => f());
  });
}
export const canInstall = () => !!installEvent && !isStandalone();
export const onInstallChange = (f: () => void) => {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
};
export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  await installEvent.prompt();
  const choice = await installEvent.userChoice;
  installEvent = null;
  listeners.forEach((f) => f());
  return choice.outcome === 'accepted';
}

/** تسجيل عامل الخدمة (في النسخة المنشورة فقط) */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => undefined));
}
