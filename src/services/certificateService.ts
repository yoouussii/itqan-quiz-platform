/**
 * سجل الشهادات (018): إصدار برقم تسلسلي ورمز تحقق من الخادم، القائمة، الإلغاء، والتحقق العام.
 */
import { supabase } from './supabase';
import { safe } from './remote';
import type { CertificateInput, CertGender, CertKind, CertStyle } from '../utils/certificate';

export interface CertRecord {
  id: string;
  serial: string;
  code: string;
  student_id: string | null;
  student_name: string;
  class_name: string;
  kind: CertKind;
  title: string;
  reason: string;
  detail: string;
  score: string;
  school_name: string;
  signer_name: string;
  signer_title: string;
  issued_on: string;
  style: Partial<CertStyle> & { gender?: CertGender };
  created_by: string;
  created_by_name: string;
  created_at: string;
  revoked_at: string | null;
  revoke_reason: string;
}

export type NewCert = Omit<CertRecord, 'id' | 'serial' | 'code' | 'created_at' | 'revoked_at' | 'revoke_reason'>;

export interface VerifyResult {
  found: boolean;
  serial?: string;
  student_name?: string;
  class_name?: string;
  kind?: CertKind;
  title?: string;
  reason?: string;
  detail?: string;
  score?: string;
  school_name?: string;
  signer_name?: string;
  signer_title?: string;
  issued_on?: string;
  revoked?: boolean;
  revoked_at?: string | null;
}

export async function issueCertificates(rows: NewCert[]): Promise<{ ok: boolean; data?: CertRecord[]; error?: string }> {
  if (!rows.length) return { ok: true, data: [] };
  const res = await safe<CertRecord[]>(() => supabase.from('certificates').insert(rows).select('*') as any);
  if (!res.ok) return { ok: false, error: res.error };
  // نفس ترتيب الإدخال (الأرقام التسلسلية متتالية)
  const data = [...(res.data || [])].sort((a, b) => a.serial.localeCompare(b.serial));
  return { ok: true, data };
}

export async function listCertificates(): Promise<{ ok: boolean; data: CertRecord[]; error?: string }> {
  const res = await safe<CertRecord[]>(() => supabase.from('certificates').select('*').order('created_at', { ascending: false }).limit(1000) as any);
  return { ok: res.ok, data: res.data || [], error: res.error };
}

export async function revokeCertificate(id: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const res = await safe<CertRecord[]>(() => supabase.from('certificates').update({ revoked_at: new Date().toISOString(), revoke_reason: reason }).eq('id', id).select('id,revoked_at') as any);
  if (res.ok && !(res.data || []).some((r) => r.revoked_at)) return { ok: false, error: 'no-permission' };
  return { ok: res.ok, error: res.error };
}

export async function verifyCertificate(code: string): Promise<{ ok: boolean; data?: VerifyResult; error?: string }> {
  const res = await safe<VerifyResult>(() => supabase.rpc('itqan_verify_certificate', { p_code: code }) as any);
  return { ok: res.ok, data: res.data || undefined, error: res.error };
}

/** شهادة من السجل إلى مدخلات القالب (لإعادة الطباعة بنفس الشكل) */
export const recordToInput = (r: CertRecord): CertificateInput => ({
  kind: r.kind,
  student: r.student_name,
  gender: r.style?.gender || 'm',
  achievement: r.reason,
  title: r.title || undefined,
  detail: r.detail || undefined,
  score: r.score || undefined,
  className: r.class_name || undefined,
  date: r.issued_on,
  signer: r.signer_name || undefined,
  signerTitle: r.signer_title || undefined,
  schoolName: r.school_name,
  serial: r.serial,
  code: r.code,
  style: { template: r.style?.template, primary: r.style?.primary, accent: r.style?.accent, qr: r.style?.qr },
});
