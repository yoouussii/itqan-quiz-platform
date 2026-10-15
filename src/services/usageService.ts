/**
 * مراقبة الاستهلاك (080): يجمع حجم ما ينزّله هذا الجهاز من Supabase، ويرسل المجموع
 * مرة كل ساعتين تقريباً (أو عند تجاوز 5 ميجابايت)، فيرى المدير استهلاك الشهر مقارنة بحد الخطة.
 */
import { supabase, setUsageListener, getSessionToken } from './supabase';
import { safe } from './remote';

const ACC_KEY = 'itqan_usage_acc_v1';
const FLUSH_EVERY_MS = 2 * 3600_000;
const FLUSH_BYTES = 5 * 1024 * 1024;
/** حد التنزيل الشهري في خطة Supabase المجانية (5 جيجابايت) */
export const FREE_EGRESS_LIMIT = 5 * 1024 ** 3;

interface Acc { bytes: number; req: number; since: number }
let acc: Acc = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(ACC_KEY) || 'null');
    if (v && typeof v.bytes === 'number') return v;
  } catch { /* ignore */ }
  return { bytes: 0, req: 0, since: Date.now() };
})();
let saveTimer: number | undefined;
let flushing = false;

const persist = () => {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    try { localStorage.setItem(ACC_KEY, JSON.stringify(acc)); } catch { /* ignore */ }
  }, 3000);
};

async function flush() {
  if (flushing || !acc.bytes || !getSessionToken()) return;
  flushing = true;
  const sent = { ...acc };
  acc = { bytes: 0, req: 0, since: Date.now() };
  const r = await safe(() => supabase.rpc('itqan_report_usage', { p_bytes: Math.round(sent.bytes), p_requests: sent.req }) as any);
  // فشل الإرسال (أو 080 غير موجود بعد): نعيد المجموع ليُرسل لاحقاً
  if (!r.ok) acc = { bytes: acc.bytes + sent.bytes, req: acc.req + sent.req, since: sent.since };
  flushing = false;
  persist();
}

setUsageListener((bytes) => {
  acc.bytes += bytes;
  acc.req += 1;
  persist();
  if (acc.bytes >= FLUSH_BYTES || Date.now() - acc.since >= FLUSH_EVERY_MS) void flush();
});

export interface UsageSummary {
  since: string;
  total_bytes: number;
  total_requests: number;
  days: { day: string; bytes: number; requests: number; users: number }[];
  by_role: { role: string; bytes: number; users: number }[];
}

/** ملخص آخر 30 يوماً (مدير النظام فقط). null = غير متاح (080 لم يُشغَّل) */
export async function fetchUsageSummary(days = 30): Promise<UsageSummary | null> {
  void flush();
  const r = await safe<UsageSummary>(() => supabase.rpc('itqan_usage_summary', { p_days: days }) as any);
  return r.ok && r.data ? r.data : null;
}
