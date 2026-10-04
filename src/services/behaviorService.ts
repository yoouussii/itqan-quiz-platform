import { supabase } from './supabase';
import { safe } from './remote';
import type { AttRecord } from './attendanceService';

export type BehaviorKind = 'violation' | 'positive';
export interface BehaviorRecord {
  id: number; student_id: string; day: string; kind: BehaviorKind; degree: number | null;
  title: string; points: number; note: string; created_by: string | null; created_by_name: string; created_at: string;
}
export interface BehaviorConfig {
  behavior_max: number;
  attendance_max: number;
  degree_points: Record<string, number>;
  absence_points: number;
  late_points: number;
  positive_points: number;
  notify_parent: boolean;
  catalog: Record<string, string[]>;
}

/** القيم الافتراضية (قواعد السلوك والمواظبة) — تُستخدم إن لم يُشغَّل 031 بعد */
export const DEFAULT_BEHAVIOR_CONFIG: BehaviorConfig = {
  behavior_max: 100, attendance_max: 100,
  degree_points: { 1: 1, 2: 2, 3: 3, 4: 10, 5: 15 } as any,
  absence_points: 1, late_points: 0.25, positive_points: 1, notify_parent: true, catalog: {},
};

export const DEGREE_LABEL: Record<number, string> = { 1: 'الدرجة الأولى', 2: 'الدرجة الثانية', 3: 'الدرجة الثالثة', 4: 'الدرجة الرابعة', 5: 'الدرجة الخامسة' };

export async function fetchBehaviorConfig(): Promise<BehaviorConfig> {
  const r = await safe<BehaviorConfig>(() => supabase.rpc('itqan_behavior_config') as any);
  if (!r.ok || !r.data) return DEFAULT_BEHAVIOR_CONFIG;
  const d: any = r.data;
  return { ...DEFAULT_BEHAVIOR_CONFIG, ...d, behavior_max: Number(d.behavior_max), attendance_max: Number(d.attendance_max), absence_points: Number(d.absence_points), late_points: Number(d.late_points), positive_points: Number(d.positive_points) };
}

export async function saveBehaviorConfig(p: Partial<BehaviorConfig>) {
  const r = await safe(() => supabase.rpc('itqan_behavior_config_save', { p }) as any);
  return { ok: r.ok };
}

/** سجلات السلوك (RLS يحدد ما يراه المستخدم) */
export async function fetchBehavior(studentIds?: string[]): Promise<BehaviorRecord[]> {
  const all: BehaviorRecord[] = [];
  for (let page = 0; page < 30; page++) {
    const r = await safe<BehaviorRecord[]>(() => {
      let q: any = supabase.from('behavior_records').select('*');
      if (studentIds?.length) q = q.in('student_id', studentIds);
      return q.order('day', { ascending: false }).order('id', { ascending: false }).range(page * 1000, page * 1000 + 999);
    });
    if (!r.ok || !Array.isArray(r.data)) break;
    all.push(...r.data.map((x) => ({ ...x, points: Number(x.points) })));
    if (r.data.length < 1000) break;
  }
  return all;
}

export async function addBehavior(rec: Omit<BehaviorRecord, 'id' | 'created_at'>) {
  const r = await safe(() => supabase.from('behavior_records').insert(rec) as any);
  return { ok: r.ok, error: r.error };
}

export async function deleteBehavior(id: number) {
  const r = await safe<any[]>(() => supabase.from('behavior_records').delete().eq('id', id).select('id') as any);
  return { ok: r.ok && Array.isArray(r.data) && r.data.length > 0 };
}

export interface ConductScore {
  behavior: number; attendance: number; violations: number; positives: number;
  deducted: number; compensated: number; absent: number; late: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** درجتا السلوك والمواظبة لطالب */
export function conductScore(beh: BehaviorRecord[], att: Pick<AttRecord, 'kind'>[], cfg: BehaviorConfig): ConductScore {
  const viol = beh.filter((b) => b.kind === 'violation');
  const pos = beh.filter((b) => b.kind === 'positive');
  const deducted = viol.reduce((a, b) => a + b.points, 0);
  const compensated = Math.min(deducted, pos.reduce((a, b) => a + b.points, 0));
  const absent = att.filter((a) => a.kind === 'absent').length;
  const late = att.filter((a) => a.kind === 'late').length;
  return {
    behavior: round2(Math.max(0, Math.min(cfg.behavior_max, cfg.behavior_max - deducted + compensated))),
    attendance: round2(Math.max(0, cfg.attendance_max - absent * cfg.absence_points - late * cfg.late_points)),
    violations: viol.length, positives: pos.length, deducted: round2(deducted), compensated: round2(compensated), absent, late,
  };
}
