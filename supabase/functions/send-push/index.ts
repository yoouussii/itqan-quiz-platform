// دالة Supabase: ترسل إشعارات الجوال (Web Push) لأجهزة المستلمين.
// يستدعيها مشغّل قاعدة البيانات (017) عند إضافة إشعار، ومعه قائمة الأجهزة المستهدفة.
// الأسرار (يضبطها سير العمل «Setup push notifications»):
//   PUSH_SECRET، VAPID_PUBLIC_KEY، VAPID_PRIVATE_KEY، VAPID_SUBJECT
// متوفرة تلقائياً في Supabase: SUPABASE_URL، SUPABASE_SERVICE_ROLE_KEY (لحذف الأجهزة المنتهية).
import webpush from 'npm:web-push@3.6.7';

interface Sub { endpoint: string; keys: { p256dh: string; auth: string } }
interface Payload { title: string; body?: string; url?: string; tag?: string; subscriptions: Sub[] }

const env = (k: string) => Deno.env.get(k) || '';

webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (!env('PUSH_SECRET') || req.headers.get('authorization') !== `Bearer ${env('PUSH_SECRET')}`) {
    return new Response('unauthorized', { status: 401 });
  }
  let p: Payload;
  try {
    p = await req.json();
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const subs = Array.isArray(p.subscriptions) ? p.subscriptions.slice(0, 5000) : [];
  const message = JSON.stringify({ title: String(p.title || '').slice(0, 120), body: String(p.body || '').slice(0, 300), url: p.url || '/', tag: p.tag });

  const gone: string[] = [];
  let sent = 0;
  // دفعات متوازية صغيرة
  for (let i = 0; i < subs.length; i += 50) {
    await Promise.all(subs.slice(i, i + 50).map(async (s) => {
      try {
        await webpush.sendNotification(s, message, { TTL: 60 * 60 * 24, urgency: 'normal' });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.endpoint);
      }
    }));
  }

  // حذف اشتراكات الأجهزة التي ألغت الإشعارات أو حُذف منها المتصفح
  if (gone.length && env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY')) {
    const list = gone.map((g) => `"${g.replace(/"/g, '')}"`).join(',');
    await fetch(`${env('SUPABASE_URL')}/rest/v1/push_subscriptions?endpoint=in.(${encodeURIComponent(list)})`, {
      method: 'DELETE',
      headers: { apikey: env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}` },
    }).catch(() => undefined);
  }

  return new Response(JSON.stringify({ sent, removed: gone.length }), { headers: { 'Content-Type': 'application/json' } });
});
