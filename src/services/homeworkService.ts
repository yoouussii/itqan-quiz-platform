import { supabase } from './supabase';
import { safe } from './remote';

export interface HwLink { title: string; url: string }
export interface Homework {
  id: string; class_id: string; subject_id: string | null; teacher_id: string; teacher_name: string;
  title: string; body: string; links: HwLink[]; due_at: string | null; allow_submission: boolean;
  max_score: number | null; created_at: string;
}
export interface HwSubmission {
  id: string; homework_id: string; student_id: string; answer: string; submitted_at: string;
  score: number | null; feedback: string; graded_by: string | null; graded_at: string | null;
}
/** بيانات الملف بلا محتواه (المحتوى يُحمَّل عند الفتح فقط) */
export interface HwFile { id: string; homework_id: string | null; submission_id: string | null; name: string; mime: string; size: number; uploaded_by: string; created_at: string }

export const MAX_FILE_MB = 5;
export const ACCEPT = '.pdf,image/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx';
const FILE_COLS = 'id,homework_id,submission_id,name,mime,size,uploaded_by,created_at';

const num = (v: unknown) => (v == null ? null : Number(v));
const normHw = (h: any): Homework => ({ ...h, links: Array.isArray(h.links) ? h.links : [], max_score: num(h.max_score) });
const normSub = (s: any): HwSubmission => ({ ...s, score: num(s.score) });

export async function fetchHomework(classIds?: string[]): Promise<{ ok: boolean; rows: Homework[] }> {
  const r = await safe<any[]>(() => {
    let q: any = supabase.from('homework').select('*');
    if (classIds) q = q.in('class_id', classIds.length ? classIds : ['__none__']);
    return q.order('created_at', { ascending: false }).limit(1000);
  });
  return { ok: r.ok, rows: (r.data || []).map(normHw) };
}

export async function createHomework(h: Omit<Homework, 'id' | 'created_at'>) {
  const r = await safe<any[]>(() => supabase.from('homework').insert(h).select('*') as any);
  return { row: r.data?.[0] ? normHw(r.data[0]) : null, error: r.error };
}

export async function updateHomework(id: string, patch: Partial<Pick<Homework, 'title' | 'body' | 'links' | 'due_at' | 'allow_submission' | 'max_score'>>) {
  const r = await safe<any[]>(() => supabase.from('homework').update(patch).eq('id', id).select('*') as any);
  return r.data?.[0] ? normHw(r.data[0]) : null;
}

export async function deleteHomework(id: string) {
  const r = await safe<any[]>(() => supabase.from('homework').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

export async function fetchSubmissions(homeworkIds: string[], studentIds?: string[]): Promise<HwSubmission[]> {
  if (!homeworkIds.length) return [];
  const r = await safe<any[]>(() => {
    let q: any = supabase.from('homework_submissions').select('*').in('homework_id', homeworkIds);
    if (studentIds?.length) q = q.in('student_id', studentIds);
    return q.limit(5000);
  });
  return (r.data || []).map(normSub);
}

/** تسليم الطالب (أو تعديله قبل التصحيح) */
export async function saveSubmission(homeworkId: string, studentId: string, answer: string, existingId?: string) {
  const r = existingId
    ? await safe<any[]>(() => supabase.from('homework_submissions').update({ answer }).eq('id', existingId).select('*') as any)
    : await safe<any[]>(() => supabase.from('homework_submissions').insert({ homework_id: homeworkId, student_id: studentId, answer }).select('*') as any);
  return { row: r.data?.[0] ? normSub(r.data[0]) : null, error: r.error };
}

export async function gradeSubmission(id: string, score: number | null, feedback: string) {
  const r = await safe<any[]>(() => supabase.from('homework_submissions').update({ score, feedback }).eq('id', id).select('*') as any);
  return r.data?.[0] ? normSub(r.data[0]) : null;
}

export async function fetchFiles(by: { homeworkIds?: string[]; submissionIds?: string[] }): Promise<HwFile[]> {
  const out: HwFile[] = [];
  if (by.homeworkIds?.length) {
    const r = await safe<HwFile[]>(() => supabase.from('homework_files').select(FILE_COLS).in('homework_id', by.homeworkIds!) as any);
    out.push(...(r.data || []));
  }
  if (by.submissionIds?.length) {
    const r = await safe<HwFile[]>(() => supabase.from('homework_files').select(FILE_COLS).in('submission_id', by.submissionIds!) as any);
    out.push(...(r.data || []));
  }
  return out.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const readAsDataUrl = (f: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(String(fr.result)); fr.onerror = () => rej(fr.error);
  fr.readAsDataURL(f);
});

/** تصغير الصور الكبيرة (صور الكاميرا عادة 3–6MB) لتوفير مساحة قاعدة البيانات */
async function shrinkImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 400 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.82));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

export type UploadError = 'too_big' | 'failed' | 'too_many';

export async function uploadFile(target: { homework_id?: string; submission_id?: string }, file: File, uploadedBy: string): Promise<{ row?: HwFile; error?: UploadError }> {
  const blob = await shrinkImage(file);
  if (blob.size > MAX_FILE_MB * 1024 * 1024) return { error: 'too_big' };
  const data = (await readAsDataUrl(blob)).split(',')[1] || '';
  const name = blob !== file ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  const r = await safe<HwFile[]>(() => supabase.from('homework_files')
    .insert({ ...target, name: name.slice(0, 200), mime: blob.type || file.type || 'application/octet-stream', data, uploaded_by: uploadedBy })
    .select(FILE_COLS) as any);
  if (!r.ok) return { error: /too_many_files/.test(r.error || '') ? 'too_many' : 'failed' };
  return { row: r.data?.[0] };
}

export async function deleteFile(id: string) {
  const r = await safe<any[]>(() => supabase.from('homework_files').delete().eq('id', id).select('id') as any);
  return r.ok && (r.data || []).length > 0;
}

/** فتح الملف: الصور وPDF في تبويب جديد، والباقي تنزيل */
export async function openFile(f: HwFile): Promise<boolean> {
  // نفتح التبويب قبل الانتظار حتى لا يمنعه المتصفح
  const viewable = f.mime.startsWith('image/') || f.mime === 'application/pdf';
  const win = viewable ? window.open('', '_blank') : null;
  const r = await safe<{ data: string }[]>(() => supabase.from('homework_files').select('data').eq('id', f.id) as any);
  const b64 = r.data?.[0]?.data;
  if (!b64) { win?.close(); return false; }
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: f.mime }));
  if (win) win.location.href = url;
  else { const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export interface HwStorage { homework: number; files: number; bytes: number; oldest: string | null }
export async function fetchHomeworkStorage(): Promise<HwStorage | null> {
  const r = await safe<HwStorage>(() => supabase.rpc('itqan_homework_storage') as any);
  return r.ok && r.data ? r.data : null;
}
export async function purgeHomework(before: string) {
  const r = await safe<number>(() => supabase.rpc('itqan_homework_purge', { p_before: before }) as any);
  return { ok: r.ok, n: Number(r.data) || 0 };
}

export const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** حالة الواجب للطالب */
export type HwState = 'graded' | 'submitted' | 'late' | 'pending' | 'overdue' | 'info';
export function hwState(h: Homework, s?: HwSubmission | null, now = Date.now()): HwState {
  if (s?.score != null) return 'graded';
  const due = h.due_at ? new Date(h.due_at).getTime() : null;
  if (s) return due && new Date(s.submitted_at).getTime() > due ? 'late' : 'submitted';
  if (!h.allow_submission) return 'info';
  return due && now > due ? 'overdue' : 'pending';
}

/** روابط آمنة فقط (http/https) */
export const safeUrl = (u: string) => { try { const x = new URL(u.trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; } };

/** رابط تضمين يوتيوب إن كان الرابط فيديو يوتيوب */
export function youtubeEmbed(u: string): string | null {
  const m = u.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}
