/**
 * قراءة ملفات زيارات منصة مزن المرفوعة (JSON) إلى صفوف جاهزة للحفظ.
 * الزيارة = تقييم زيارة صفية لمعلم. «الطلاب» في التفاصيل هم طلاب الفصل ودرجات اختبارهم.
 *
 * يُقبل:
 *  - قائمة الزيارات: GetVisits ← { results: [...] } أو مصفوفة؛ كل عنصر فيه الأسماء (teacherName…).
 *  - تفاصيل زيارة: GetVisitById/<id> ← كائن واحد فيه students و itemResponses.
 * يُدمَج ما يخص الرقم نفسه: القائمة تعطي الملخص، والتفاصيل تضيف الطلاب والبنود.
 */

export interface MoznVisitRow {
  id: number; visit_date: string; type_name: string; title: string;
  teacher_name: string; visitor_name: string; school_name: string; course_name: string;
  grade_name: string; section_name: string; period: string; students_count: number | null;
  mark: number | null; effect: number | null; total_score: number | null; grade_label: string;
  notes: string; recommendations: string;
  data: Record<string, unknown>; detail: Record<string, unknown> | null;
}

const s = (v: unknown) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const n = (v: unknown): number | null => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? Math.round(x * 100) / 100 : null; };
const dateOf = (v: unknown) => { const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : ''; };

/** التقدير من نطاقات مزن (gradeBandsJson) حسب الدرجة من 100 */
function bandOf(score: number | null, bandsJson: unknown): string {
  if (score == null) return '';
  try {
    const bands = typeof bandsJson === 'string' ? JSON.parse(bandsJson) : bandsJson;
    if (Array.isArray(bands)) {
      const b = bands.find((x: any) => score >= Number(x.minScore) && score <= Number(x.maxScore));
      if (b) return s(b.labelAr || b.labelEn || b.code);
    }
  } catch { /* ignore */ }
  return '';
}

/** عنصر زيارة واحد (من القائمة أو التفاصيل) إلى صف، مع حفظ الطلاب والبنود إن وُجدت */
function visitToRow(v: any): MoznVisitRow | null {
  const id = Number(v?.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  const tpl = v.visitTypeTemplate || {};
  const total = n(v.totalScore);
  const hasDetail = Array.isArray(v.students) && v.students.length > 0 || Array.isArray(v.itemResponses) && v.itemResponses.length > 0;
  return {
    id,
    visit_date: dateOf(v.visitDate),
    type_name: s(tpl.nameAr || tpl.name || tpl.code),
    title: s(v.title),
    teacher_name: s(v.teacherName),
    visitor_name: s(v.creatorName || v.visitorName),
    school_name: s(v.schoolNameAr || v.schoolNameEn || v.displaySchoolName),
    course_name: s(v.course?.courseNameAr || v.course?.courseName || v.courseName),
    grade_name: s(v.grade?.gradeNameAr || v.grade?.gradeName || v.gradeAr),
    section_name: s(v.section?.sectionNameAr || v.section?.sectionName),
    period: s(v.period),
    students_count: Number.isFinite(Number(v.studentsCount)) ? Number(v.studentsCount) : null,
    mark: n(v.mark), effect: n(v.effect), total_score: total,
    grade_label: s(v.gradeAr) || (total != null && total > 0 ? bandOf(total, v.gradeBandsJson || tpl.gradeBandsJson) : ''),
    notes: s(v.notes), recommendations: s(v.recommendations),
    // ملخص بلا المصفوفات الكبيرة
    data: { schoolId: v.schoolId, classId: v.classId, sectionId: v.sectionId, courseId: v.courseId,
      visitType: v.visitType, visitTypeTemplateId: v.visitTypeTemplateId, isSent: v.isSent, createdOn: v.createdOn },
    detail: hasDetail
      ? {
          students: (v.students || []).map((st: any) => ({ name: s(st.studentName), mark: n(st.mark), markFrom100: n(st.markFrom100), notes: s(st.notes) })),
          items: (v.itemResponses || []).map((it: any) => ({ name: s(it.itemNameAr || it.itemName || it.name), value: n(it.value ?? it.score), note: s(it.note || it.notes) })),
          scale: tpl.ratingScaleTemplate ? { nameAr: s(tpl.ratingScaleTemplate.nameAr), min: n(tpl.ratingScaleTemplate.minValue), max: n(tpl.ratingScaleTemplate.maxValue) } : null,
        }
      : null,
  };
}

/** يُرجع كل الزيارات من نصوص JSON (قوائم و/أو تفاصيل)، مدموجة بالرقم (التفاصيل تطغى) */
export function parseMoznFiles(contents: string[]): { rows: MoznVisitRow[]; errors: string[] } {
  const byId = new Map<number, MoznVisitRow>();
  const errors: string[] = [];
  const add = (v: any) => {
    const row = visitToRow(v);
    if (!row) return;
    const prev = byId.get(row.id);
    if (!prev) { byId.set(row.id, row); return; }
    // ادمج: التفاصيل (من فيه detail/طلاب) تكمّل الملخص
    const merged = { ...prev };
    for (const k of Object.keys(row) as Array<keyof MoznVisitRow>) {
      const val = row[k];
      if (k === 'detail') { if (row.detail) merged.detail = row.detail; continue; }
      if (val !== '' && val != null) (merged as any)[k] = val;
    }
    byId.set(row.id, merged);
  };
  contents.forEach((txt, i) => {
    let d: any;
    try { d = JSON.parse(txt); } catch { errors.push(`ملف ${i + 1}: ليس JSON صالحاً`); return; }
    const list = Array.isArray(d) ? d : Array.isArray(d?.results) ? d.results : Array.isArray(d?.result) ? d.result : (d && typeof d === 'object' && d.id != null ? [d] : null);
    if (!list) { errors.push(`ملف ${i + 1}: لا يحتوي زيارات`); return; }
    let used = 0;
    list.forEach((v: any) => { if (v && v.id != null && (v.teacherName !== undefined || v.visitDate !== undefined || v.students !== undefined)) { add(v); used++; } });
    if (used === 0) errors.push(`ملف ${i + 1}: لم يُتعرَّف على زيارات بداخله`);
  });
  return { rows: [...byId.values()], errors };
}
