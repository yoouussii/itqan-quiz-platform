import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  ShieldCheck,
  UserCheck,
  GraduationCap,
  X,
  Edit2,
  KeyRound,
  Sliders,
  UserCircle2,
  Upload,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { UserCog } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_PASSWORD, StorageService } from '../../services/storage';
import { resolveClass } from '../../utils/classMatch';
import { PERMISSION_DEFS, PERM_GROUPS, TEACHER_ALWAYS, normalizePerms, hasPerm } from '../../utils/permissions';
import { exportStudentReport, reportExtras } from '../../utils/studentReport';
import { computePointEvents, earnedBadges, totalPoints } from '../../utils/points';
import { formatFullArabicDate } from '../../utils/dateUtils';
import { FileText as FileTextIcon } from 'lucide-react';
import { Role, User, TeacherPermissions, Gender } from '../../types';
import { normalizeClassName } from '../../utils/classMatch';
import { Avatar } from '../common/Avatar';
import { uiDir, t } from '../../i18n';

export const UsersManagement: React.FC = () => {
  const {
    currentUser,
    users,
    classes,
    subjects,
    submissions,
    quizzes,
    awards,
    addUser,
    updateUserData,
    resetUserPassword,
    deleteUserItem,
    refreshData,
    bulkDeleteUsers,
    bulkMoveStudents,
    branches,
    bulkMoveToBranch,
  } = useApp();
  const isAdminUser = currentUser?.role === 'admin';
  const branchName = (id?: string | null) => branches.find((b) => b.id === id)?.name;
  const [moveBranchId, setMoveBranchId] = useState('');
  const [branchFilter, setBranchFilter] = useState('all'); // all | none | معرّف فرع
  const [genderFilter, setGenderFilter] = useState('all');
  // حقول إضافية في نموذج المستخدم
  const [gender, setGender] = useState<Gender | ''>('');
  const [branchId, setBranchId] = useState('');
  const [childIds, setChildIds] = useState<string[]>([]);
  const [childSearch, setChildSearch] = useState('');
  // التحديد الجماعي (حذف / نقل إلى صف)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [moveClassId, setMoveClassId] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  // التحقق من صلاحية إضافة الطلاب
  const canAddStudent =
    currentUser?.role === 'admin' ||
    ((currentUser?.role === 'teacher' || currentUser?.role === 'supervisor') && currentUser?.teacher_permissions?.can_add_students);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all'); // all | none | معرّف صف

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [newPasswordValue, setNewPasswordValue] = useState('');

  // Form state for creating / editing
  const [name, setName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [password, setPassword] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [classId, setClassId] = useState(classes[0]?.id || '');
  const [assignedSubjectIds, setAssignedSubjectIds] = useState<string[]>([]);
  const [assignedClassIds, setAssignedClassIds] = useState<string[]>([]);
  const [teacherPermissions, setTeacherPermissions] = useState<TeacherPermissions>({
    can_add_custom_subjects: false,
    can_manage_classes: false,
    can_view_all_reports: false,
    can_add_students: false,
    can_add_teachers: false,
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState<Array<{
    name: string; national_id: string; password: string; class_name: string;
    gender: Gender | null; branch_name: string; parent_id: string; parent_password: string;
  }>>([]);
  const [importError, setImportError] = useState('');
  // اختيار الصف يدوياً لكل صف في الملف + صف افتراضي لغير المطابقين
  const [importClassOverrides, setImportClassOverrides] = useState<Record<number, string>>({});
  const [importDefaultClassId, setImportDefaultClassId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // المعلم والمشرف: صلاحيات محدودة (يرون ويضيفون الطلاب الذين أضافوهم فقط)
  const isTeacher = currentUser?.role === 'teacher' || currentUser?.role === 'supervisor';
  const isStaffRole = (r?: string) => r === 'teacher' || r === 'supervisor';
  const pickPerms = (src: TeacherPermissions): TeacherPermissions => normalizePerms(src) as TeacherPermissions;

  // المستخدمون ضمن صلاحية من يتصفح (المعلم يرى الطلاب الذين أضافهم فقط)
  const scopeUsers = users.filter((u) => !isTeacher || (u.role === 'student' && u.created_by === currentUser?.id));
  const inClass = (u: User, id: string) => u.class_id === id || !!u.assigned_class_ids?.includes(id);
  const hasNoClass = (u: User) => u.role !== 'admin' && !u.class_id && !(u.assigned_class_ids && u.assigned_class_ids.length > 0);
  const roleMatches = (u: User) => isTeacher || roleFilter === 'all' || u.role === roleFilter;
  const classCount = (id: string) => scopeUsers.filter((u) => roleMatches(u) && inClass(u, id)).length;
  const noClassCount = scopeUsers.filter((u) => roleMatches(u) && hasNoClass(u)).length;
  const roleCount = (r: string) => scopeUsers.filter((u) => u.role === r).length;
  // المعلم يرى في الفلتر الصفوف التي فيها طلابه فقط، والمدير كل الصفوف
  const classFilterOptions = isTeacher ? classes.filter((c) => classCount(c.id) > 0) : classes;

  const reportFor = async (u: User) => {
    const subs = (submissions || []).filter((x) => x.student_id === u.id);
    const myAwards = (awards || []).filter((a) => a.student_id === u.id);
    await exportStudentReport({
      name: u.name,
      nationalId: u.national_id,
      className: classes.find((c) => c.id === (u.class_id || u.assigned_class_ids?.[0]))?.name,
      results: subs.map((x) => ({
        quiz: x.quiz?.title || '—', subject: x.subject?.name || '—', score: `${x.score}/${x.total_possible_score}`,
        pct: Number(x.percentage) || 0, date: formatFullArabicDate(x.completed_at),
      })),
      points: totalPoints(computePointEvents(subs, quizzes || [], myAwards)),
      badgeKeys: earnedBadges(subs, quizzes || []),
      ...reportExtras(u.id, quizzes || [], submissions || [], (id) => subjects.find((s) => s.id === id)?.name || ''),
      awards: myAwards,
    });
  };

  const filteredUsers = users.filter((u) => {
    // المعلم لا يرى سوى الطلاب الذين أضافهم هو فقط
    if (isTeacher) {
      if (u.role !== 'student') return false;
      if (u.created_by !== currentUser?.id) return false;
    }
    const matchesSearch =
      !searchTerm.trim() ||
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.national_id.includes(searchTerm) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = isTeacher ? true : (roleFilter === 'all' || u.role === roleFilter);
    const matchesClass =
      classFilter === 'all' ? true : classFilter === 'none' ? hasNoClass(u) : inClass(u, classFilter);
    const matchesBranch = branchFilter === 'all' ? true : branchFilter === 'none' ? !u.branch_id : u.branch_id === branchFilter;
    const matchesGender = genderFilter === 'all' ? true : u.gender === genderFilter;
    return matchesSearch && matchesRole && matchesClass && matchesBranch && matchesGender;
  });

  /** الصف النهائي لكل طالب في الملف: اختيار المستخدم ← مطابقة واضحة ← الصف الافتراضي ← (لا شيء) */
  const resolveImportRow = (i: number, className: string) => {
    const override = importClassOverrides[i];
    if (override) return { id: override, status: 'manual' as const };
    const m = resolveClass(classes, className);
    if (m.id) return { id: m.id, status: m.status };
    if (importDefaultClassId) return { id: importDefaultClassId, status: 'default' as const };
    return { id: null as string | null, status: m.status };
  };

  const handleOpenAddModal = (defaultRole: Role = 'student') => {
    setName('');
    setNationalId('');
    setPassword('itqan123');
    setJobTitle('');
    setRole(defaultRole);
    // لا نختار صفاً تلقائياً (إلا إذا كان الوحيد) حتى لا يُحفظ الطالب في أول صف دون قصد
    setClassId(classes.length === 1 ? classes[0].id : '');
    setAssignedSubjectIds([]);
    setAssignedClassIds([]);
    setTeacherPermissions(pickPerms({}));
    setGender('');
    setBranchId(isAdminUser ? '' : currentUser?.branch_id || '');
    setChildIds([]);
    setChildSearch('');
    setShowAddModal(true);
  };

  const handleOpenEditModal = (u: User) => {
    const studentClassId = u.class_id || u.assigned_class_ids?.[0] || classes[0]?.id || '';
    const subIds = (Array.isArray(u.assigned_subject_ids) && u.assigned_subject_ids.length > 0)
      ? [...u.assigned_subject_ids]
      : (u.specialty_id ? [u.specialty_id] : []);
    const clsIds = (Array.isArray(u.assigned_class_ids) && u.assigned_class_ids.length > 0)
      ? [...u.assigned_class_ids]
      : (studentClassId ? [studentClassId] : []);
    // كل الصلاحيات (وليس الخمس القديمة فقط) حتى لا تُمسح البقية عند الحفظ
    const perms: TeacherPermissions = pickPerms(u.teacher_permissions || (u as any).permissions || {});

    setEditingUser({
      ...u,
      password: '',
      class_id: studentClassId,
      assigned_class_ids: clsIds,
      assigned_subject_ids: subIds,
      specialty_id: subIds[0] || null,
      teacher_permissions: perms,
      permissions: perms,
    });

    setName(u.name);
    setNationalId(u.national_id);
    setPassword('');
    setRole(u.role);
    setClassId(studentClassId);
    setAssignedSubjectIds(subIds);
    setAssignedClassIds(clsIds);
    setTeacherPermissions(perms);
    setGender(u.gender || '');
    setBranchId(u.branch_id || '');
    setChildIds(u.child_ids || []);
    setChildSearch('');
  };

  const toggleSubjectAssignment = (subjId: string) => {
    setAssignedSubjectIds((prev) => {
      const next = prev.includes(subjId) ? prev.filter((id) => id !== subjId) : [...prev, subjId];
      if (editingUser) {
        setEditingUser((prevUser) => prevUser ? ({
          ...prevUser,
          assigned_subject_ids: next,
          specialty_id: next[0] || null,
        }) : null);
      }
      return next;
    });
  };

  const toggleClassAssignment = (cId: string) => {
    setAssignedClassIds((prev) => {
      const next = prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId];
      if (editingUser) {
        setEditingUser((prevUser) => prevUser ? ({
          ...prevUser,
          assigned_class_ids: next,
          class_id: next[0] || null,
        }) : null);
      }
      return next;
    });
  };

  const togglePermissionKey = (key: keyof TeacherPermissions) => {
    setTeacherPermissions((prev) => {
      const next = {
        ...prev,
        [key]: !prev[key],
      };
      if (editingUser) {
        setEditingUser((prevUser) => prevUser ? ({
          ...prevUser,
          teacher_permissions: next,
          permissions: next,
        }) : null);
      }
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    const exists = users.some((u) => u.national_id === nationalId.trim());
    if (exists) {
      alert(t('رقم الهوية مسجل مسبقاً لمستخدم آخر'));
      return;
    }

    // المعلم يضيف طلاباً فقط دائماً
    const effectiveRole: Role = isTeacher ? 'student' : role;

    if (effectiveRole === 'student' && !classId) {
      alert(t('يرجى اختيار الصف الدراسي للطالب'));
      return;
    }
    if (effectiveRole === 'parent' && childIds.length === 0) {
      alert(t('اختر ابناً واحداً على الأقل لربطه بحساب ولي الأمر'));
      return;
    }
    const permsObj: TeacherPermissions | undefined = isStaffRole(effectiveRole) ? pickPerms(teacherPermissions) : undefined;

    await addUser({
      name: name.trim(),
      national_id: nationalId.trim(),
      username: nationalId.trim(),
      email: `${nationalId.trim()}@itqan.edu.sa`,
      password,
      job_title: jobTitle.trim() || null,
      role: effectiveRole,
      specialty_id: isStaffRole(effectiveRole) ? (assignedSubjectIds[0] || null) : null,
      assigned_subject_ids: isStaffRole(effectiveRole) ? [...assignedSubjectIds] : [],
      assigned_class_ids: isStaffRole(effectiveRole) ? [...assignedClassIds] : (effectiveRole === 'student' ? [classId] : []),
      class_id: effectiveRole === 'student' ? classId : (assignedClassIds[0] || null),
      teacher_permissions: permsObj,
      permissions: permsObj,
      gender: gender || null,
      branch_id: isAdminUser ? branchId || null : currentUser?.branch_id || null,
      child_ids: effectiveRole === 'parent' ? [...childIds] : [],
      created_by: currentUser?.id,
    });
    setShowAddModal(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const effectiveRole: Role = isTeacher ? 'student' : (editingUser.role || role);
    const currentPerms = editingUser.teacher_permissions || teacherPermissions;
    const permsObj: TeacherPermissions | undefined = isStaffRole(effectiveRole) ? pickPerms(currentPerms) : undefined;

    const studentClassId = editingUser.class_id || editingUser.assigned_class_ids?.[0] || classId || classes[0]?.id || null;
    const teacherSubs = editingUser.assigned_subject_ids || assignedSubjectIds || [];
    const teacherCls = editingUser.assigned_class_ids || assignedClassIds || [];

    const currentName = (editingUser.name || name).trim();
    const currentNationalId = (editingUser.national_id || nationalId).trim();

    // توحيد الحقول المزدوجة بدقة:
    // الفصول: class_id و assigned_class_ids
    const unifiedClassId = effectiveRole === 'student' ? studentClassId : (teacherCls[0] || null);
    const unifiedAssignedClassIds = effectiveRole === 'student'
      ? (studentClassId ? [studentClassId] : [])
      : [...teacherCls];

    // المواد: specialty_id و assigned_subject_ids
    const unifiedSpecialtyId = isStaffRole(effectiveRole) ? (teacherSubs[0] || null) : null;
    const unifiedAssignedSubjectIds = isStaffRole(effectiveRole) ? [...teacherSubs] : [];

    const updates: Partial<User> & { password?: string } = {
      name: currentName,
      national_id: currentNationalId,
      username: currentNationalId,
      email: editingUser.email || `${currentNationalId}@itqan.edu.sa`,
      role: effectiveRole,
      job_title: (editingUser.job_title || '').trim() || null,
      specialty_id: unifiedSpecialtyId,
      assigned_subject_ids: unifiedAssignedSubjectIds,
      class_id: unifiedClassId,
      assigned_class_ids: unifiedAssignedClassIds,
      teacher_permissions: permsObj,
      permissions: permsObj,
      gender: gender || null,
      ...(isAdminUser ? { branch_id: branchId || null, child_ids: effectiveRole === 'parent' ? [...childIds] : [] } : {}),
    };

    // لا نرسل كلمة المرور إلا إذا غيّرها المدير فعلاً (حتى لا تُكتب نسخة قديمة فوق الحالية)
    const currentPass = (editingUser.password || password || '').trim();
    const originalPass = (users.find((u) => u.id === editingUser.id)?.password || '').trim();
    if (currentPass && currentPass !== originalPass) {
      updates.password = currentPass;
    }

    await updateUserData(editingUser.id, updates);
    await refreshData();
    setEditingUser(null);
    setShowAddModal(false);
  };

  const handlePasswordResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordResetUser || !newPasswordValue.trim()) return;
    resetUserPassword(passwordResetUser.id, newPasswordValue.trim());
    setPasswordResetUser(null);
    setNewPasswordValue('');
  };

  const handleDelete = (id: string, userName: string) => {
    if (window.confirm(t('هل أنت متأكد من حذف المستخدم ({name}) نهائياً من منصة إتقان؟', { name: userName }))) {
      deleteUserItem(id);
    }
  };

  /** النوع من خلية Excel: ذكر/أنثى، ولد/بنت، م/ف، male/female */
  function parseGender(v: any): Gender | null {
    const g = String(v ?? '').trim().toLowerCase();
    if (/^(ذكر|ولد|م|male|m|boy|بنين)$/.test(g)) return 'male';
    if (/^(أنثى|انثى|انثي|بنت|ف|female|f|girl|بنات)$/.test(g)) return 'female';
    return null;
  }
  /** الفرع من اسمه في الملف (تطابق تام ثم جزئي واضح) */
  function resolveBranch(name: string): string | null {
    const q = normalizeClassName(name);
    if (!q) return null;
    const norm = branches.map((b) => ({ id: b.id, n: normalizeClassName(b.name) }));
    const exact = norm.filter((b) => b.n === q);
    if (exact.length === 1) return exact[0].id;
    const part = norm.filter((b) => b.n && (b.n.includes(q) || q.includes(b.n)));
    return part.length === 1 ? part[0].id : null;
  }

  // === Excel Import Functions ===
  const downloadExcelTemplate = () => {
    const templateData = [
      { 'الاسم': 'أحمد محمد', 'رقم الهوية': '1234567890', 'كلمة السر': '123456', 'الصف / الشعبة': 'الصف الأول أ', 'النوع': 'ذكر', 'الفرع': 'فرع البنين', 'هوية ولي الأمر': '1098765432', 'كلمة سر ولي الأمر': '654321' },
      { 'الاسم': 'سارة علي', 'رقم الهوية': '0987654321', 'كلمة السر': '123456', 'الصف / الشعبة': 'الصف الثاني ب', 'النوع': 'أنثى', 'الفرع': 'فرع البنات', 'هوية ولي الأمر': '1098765432', 'كلمة سر ولي الأمر': '654321' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'طلاب');
    ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    XLSX.writeFile(wb, 'نموذج_استيراد_طلاب.xlsx');
  };

  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportPreview([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

        if (!jsonData || jsonData.length === 0) {
          setImportError(t('الملف فارغ أو لا يحتوي على بيانات صالحة'));
          return;
        }

        const parsed = jsonData.map((row: any) => ({
          name: String(row['الاسم'] || row['name'] || row['Name'] || '').trim(),
          national_id: String(row['رقم الهوية'] || row['اسم المستخدم'] || row['national_id'] || row['username'] || row['ID'] || '').trim(),
          password: String(row['كلمة السر'] || row['password'] || row['Password'] || DEFAULT_PASSWORD).trim(),
          class_name: String(row['الصف / الشعبة'] || row['الصف'] || row['class'] || row['Class'] || '').trim(),
          gender: parseGender(row['النوع'] || row['الجنس'] || row['gender'] || row['Gender']),
          branch_name: String(row['الفرع'] || row['branch'] || row['Branch'] || '').trim(),
          parent_id: String(row['هوية ولي الأمر'] || row['رقم هوية ولي الأمر'] || row['parent_id'] || '').trim(),
          parent_password: String(row['كلمة سر ولي الأمر'] || row['كلمة مرور ولي الأمر'] || row['parent_password'] || '').trim(),
        })).filter((s) => s.name && s.national_id);

        if (parsed.length === 0) {
          setImportError(t('لم يتم العثور على بيانات صالحة. تأكد من وجود أعمدة: الاسم، رقم الهوية'));
          return;
        }

        setImportPreview(parsed);
        setImportClassOverrides({});
        setImportDefaultClassId('');
        setShowImportModal(true);
      } catch (err) {
        console.error('Excel parse error:', err);
        setImportError(t('حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف Excel صالح (.xlsx)'));
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkImport = async () => {
    if (importPreview.length === 0) return;
    setIsImporting(true);

    try {
      let importedCount = 0;
      let skippedCount = 0;
      // الطلاب (الجدد والمسجلون مسبقاً) مع هوية ولي الأمر لربطهم بحسابه
      const linked: Array<{ id: string; name: string; gender: Gender | null; parentId: string; parentPassword: string }> = [];

      for (let idx = 0; idx < importPreview.length; idx++) {
        const student = importPreview[idx];
        const existing = users.find((u) => u.national_id === student.national_id);
        if (existing) {
          if (student.parent_id && existing.role === 'student') {
            linked.push({ id: existing.id, name: existing.name, gender: existing.gender || student.gender, parentId: student.parent_id, parentPassword: student.parent_password });
          }
          skippedCount++;
          continue;
        }

        const classId = resolveImportRow(idx, student.class_name).id;
        if (!classId) {
          // لا نضع الطالب في صف عشوائي: يُتخطى (الزر معطّل أصلاً حتى تُحسم كل الصفوف)
          skippedCount++;
          continue;
        }

        const created = await addUser({
          name: student.name,
          national_id: student.national_id,
          username: student.national_id,
          email: `${student.national_id}@itqan.edu.sa`,
          password: student.password || DEFAULT_PASSWORD,
          role: 'student' as const,
          specialty_id: null,
          assigned_subject_ids: [],
          assigned_class_ids: classId ? [classId] : [],
          class_id: classId || null,
          gender: student.gender,
          branch_id: isAdminUser ? resolveBranch(student.branch_name) : currentUser?.branch_id || null,
          created_by: currentUser?.id,
        });
        if (student.parent_id && created?.id) {
          linked.push({ id: created.id, name: student.name, gender: student.gender, parentId: student.parent_id, parentPassword: student.parent_password });
        }
        importedCount++;
      }

      // حسابات أولياء الأمور: حساب واحد لكل هوية، مرتبط بكل أبنائه في الملف (للمدير فقط)
      let parentsCreated = 0;
      let parentsLinked = 0;
      let parentConflicts = 0;
      if (isAdminUser) {
        const byParent = new Map<string, typeof linked>();
        linked.forEach((l) => byParent.set(l.parentId, [...(byParent.get(l.parentId) || []), l]));
        for (const [pid, kids] of byParent) {
          const known = StorageService.getUsers().find((u) => u.national_id === pid);
          if (known && known.role !== 'parent') {
            parentConflicts++;
            continue;
          }
          if (known) {
            const merged = Array.from(new Set([...(known.child_ids || []), ...kids.map((k) => k.id)]));
            if (merged.length !== (known.child_ids || []).length) {
              await updateUserData(known.id, { child_ids: merged });
              parentsLinked++;
            }
            continue;
          }
          const first = kids[0];
          await addUser({
            name: `والد ${first.gender === 'female' ? 'الطالبة' : 'الطالب'} ${first.name}`,
            national_id: pid,
            username: pid,
            email: `${pid}@itqan.edu.sa`,
            password: kids.find((k) => k.parentPassword)?.parentPassword || DEFAULT_PASSWORD,
            role: 'parent' as const,
            gender: 'male',
            child_ids: kids.map((k) => k.id),
            assigned_subject_ids: [],
            assigned_class_ids: [],
            class_id: null,
            created_by: currentUser?.id,
          });
          parentsCreated++;
        }
      }

      setShowImportModal(false);
      setImportPreview([]);

      const lines = [
        skippedCount > 0
          ? t('تم استيراد {n} طالب، وتخطي {s} (مسجل مسبقاً أو بدون صف محدد).', { n: importedCount, s: skippedCount })
          : t('تم استيراد {n} طالب بنجاح.', { n: importedCount }),
      ];
      if (parentsCreated) lines.push(t('أُنشئ {n} حساب ولي أمر.', { n: parentsCreated }));
      if (parentsLinked) lines.push(t('رُبط أبناء جدد بـ {n} حساب ولي أمر موجود.', { n: parentsLinked }));
      if (parentConflicts) lines.push(t('{n} هوية ولي أمر مستخدمة لحساب آخر (ليس ولي أمر) فلم تُربط.', { n: parentConflicts }));
      if (!isAdminUser && linked.length) lines.push(t('حسابات أولياء الأمور يُنشئها مدير النظام فقط.'));
      alert(lines.join('\n'));
    } catch (err) {
      console.error('Bulk import error:', err);
      alert(t('حدث خطأ أثناء الاستيراد. تحقق من البيانات وأعد المحاولة.'));
    } finally {
      setIsImporting(false);
    }
  };

  const importUnresolvedCount = importPreview.filter(
    (s, i) => !users.some((u) => u.national_id === s.national_id) && !resolveImportRow(i, s.class_name).id
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir={uiDir()}>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-slate-900 dark:text-white">{isTeacher ? t('طلابي') : t('المستخدمون')}</h1>
          <p className="text-[15px] text-slate-500 dark:text-slate-400 mt-0.5">
            {scopeUsers.length}{' '}{t('حساباً · لا يوجد تسجيل ذاتي، الحسابات تُنشأ من هنا فقط')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isTeacher && canAddStudent && (
            <button
              onClick={() => handleOpenAddModal('student')}
              className="inline-flex items-center gap-2 h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[15px] font-semibold"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t('إضافة طالب جديد')}</span>
            </button>
          )}

          {canAddStudent && (
            <>
              <button
                onClick={downloadExcelTemplate}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-[15px] font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                title={t('تحميل نموذج Excel')}
              >
                <Download className="w-4 h-4" />
                <span>{t('نموذج Excel')}</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl text-[15px] font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800"
                title={t('استيراد طلاب من ملف Excel')}
              >
                <Upload className="w-4 h-4" />
                <span>{t('استيراد من Excel')}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleExcelFileUpload}
              />
            </>
          )}

          {!isTeacher && (
            <button
              onClick={() => handleOpenAddModal('student')}
              className="inline-flex items-center gap-2 h-11 px-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[15px] font-semibold"
            >
              <UserPlus className="w-4 h-4" />
              <span>{t('إضافة مستخدم')}</span>
            </button>
          )}
        </div>
      </div>

      {/* تبويبات الأدوار + البحث والصف */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center justify-between">
        {!isTeacher ? (
          <div className="flex gap-1 p-1 rounded-xl bg-slate-200/60 dark:bg-slate-800/70 w-fit max-w-full overflow-x-auto" role="tablist" aria-label={t('تصفية حسب الدور')}>
            {[
              { id: 'all', label: t('الكل'), n: scopeUsers.length },
              { id: 'student', label: t('الطلاب'), n: roleCount('student') },
              { id: 'teacher', label: t('المعلمون'), n: roleCount('teacher') },
              { id: 'supervisor', label: t('المشرفون'), n: roleCount('supervisor') },
              { id: 'admin', label: t('المدراء'), n: roleCount('admin') },
              { id: 'parent', label: t('أولياء الأمور'), n: roleCount('parent') },
            ].filter((t) => t.id === 'all' || t.n > 0).map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={roleFilter === t.id} onClick={() => setRoleFilter(t.id)}
                className={`h-10 px-4 rounded-lg text-[14.5px] font-semibold whitespace-nowrap ${roleFilter === t.id ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>
                {t.label} <span className="tabular-nums">{t.n}</span>
              </button>
            ))}
          </div>
        ) : <span />}

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 h-11 w-full sm:w-72 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500">
            <Search className="w-[18px] h-[18px] shrink-0" />
            <input
              type="text"
              aria-label={t('بحث بالاسم أو الهوية')}
              placeholder={t('بحث بالاسم أو الهوية')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 min-w-0 bg-transparent outline-none text-[15px] text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </label>
          <select
            aria-label={t('تصفية حسب الصف')}
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-800 dark:text-slate-100 max-w-[16rem]"
          >
            <option value="all">{t('كل الشعب')}</option>
            {classFilterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({classCount(c.id)})
              </option>
            ))}
            {noClassCount > 0 && <option value="none">{t('بدون صف (')}{noClassCount})</option>}
          </select>
          {isAdminUser && branches.length > 0 && (
            <select aria-label={t('تصفية حسب الفرع')} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
              className="h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-800 dark:text-slate-100 max-w-[14rem]">
              <option value="all">{t('كل الفروع')}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              <option value="none">{t('بدون فرع')}</option>
            </select>
          )}
          <select aria-label={t('تصفية حسب النوع')} value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)}
            className="h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-800 dark:text-slate-100">
            <option value="all">{t('ذكور وإناث')}</option>
            <option value="male">{t('ذكور')}</option>
            <option value="female">{t('إناث')}</option>
          </select>
          {(roleFilter !== 'all' || classFilter !== 'all' || branchFilter !== 'all' || genderFilter !== 'all' || searchTerm.trim()) && (
            <button
              type="button"
              onClick={() => {
                setRoleFilter('all');
                setClassFilter('all');
                setBranchFilter('all');
                setGenderFilter('all');
                setSearchTerm('');
              }}
              className="h-11 px-2 text-sm font-semibold text-indigo-700 dark:text-indigo-400 hover:underline"
            >
              {t('مسح الفلاتر (')}{filteredUsers.length}{' '}{t('نتيجة)')}
            </button>
          )}
        </div>
      </div>

      {/* شريط الإجراءات الجماعية */}
      {selectedIds.length > 0 && (() => {
        const selectedStudents = selectedIds.filter((id) => users.find((u) => u.id === id)?.role === 'student');
        return (
          <div className="sticky top-[72px] z-20 p-2.5 ps-4 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white shadow-lg flex flex-wrap items-center gap-2" role="region" aria-label={t('إجراءات على المحدد')}>
            <span className="text-[15px] font-semibold flex-1 min-w-[8rem]">{t('تم تحديد')}{' '}{selectedIds.length}</span>
            <select aria-label={t('نقل إلى صف')} value={moveClassId} onChange={(e) => setMoveClassId(e.target.value)}
              className="h-10 px-3 text-sm rounded-xl border-0 bg-white/10 text-white [&>option]:text-slate-900">
              <option value="">{t('نقل الطلاب إلى شعبة…')}</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" disabled={bulkBusy || !moveClassId || !selectedStudents.length}
              onClick={async () => {
                const cls = classes.find((c) => c.id === moveClassId);
                if (!window.confirm(t('نقل {n} طالب إلى {to}؟', { n: selectedStudents.length, to: cls?.name || '' }))) return;
                setBulkBusy(true);
                await bulkMoveStudents(selectedStudents, moveClassId);
                setBulkBusy(false);
                setSelectedIds([]);
                setMoveClassId('');
              }}
              className="h-10 px-4 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 text-white disabled:opacity-40">
              {t('نقل')}{selectedStudents.length ? ` (${t('{n} طالب', { n: selectedStudents.length })})` : ''}
            </button>
            {isAdminUser && branches.length > 0 && (
              <>
                <select aria-label={t('نقل إلى فرع')} value={moveBranchId} onChange={(e) => setMoveBranchId(e.target.value)}
                  className="h-10 px-3 text-sm rounded-xl border-0 bg-white/10 text-white [&>option]:text-slate-900">
                  <option value="">{t('نقل إلى فرع…')}</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  <option value="__none">{t('إزالة الفرع')}</option>
                </select>
                <button type="button" disabled={bulkBusy || !moveBranchId}
                  onClick={async () => {
                    const target = moveBranchId === '__none' ? null : moveBranchId;
                    if (!window.confirm(target ? t('نقل {n} مستخدم إلى {to}؟', { n: selectedIds.length, to: branchName(target) || '' }) : t('إزالة الفرع عن {n} مستخدم؟', { n: selectedIds.length }))) return;
                    setBulkBusy(true);
                    await bulkMoveToBranch(selectedIds, target);
                    setBulkBusy(false);
                    setSelectedIds([]);
                    setMoveBranchId('');
                  }}
                  className="h-10 px-4 rounded-xl text-sm font-semibold bg-white/15 hover:bg-white/25 text-white disabled:opacity-40">
                  {t('نقل للفرع')}
                </button>
              </>
            )}
            <button type="button" disabled={bulkBusy}
              onClick={async () => {
                if (!window.confirm(t('حذف {n} مستخدم نهائياً من المنصة؟ لا يمكن التراجع.', { n: selectedIds.length }))) return;
                setBulkBusy(true);
                await bulkDeleteUsers(selectedIds);
                setBulkBusy(false);
                setSelectedIds([]);
              }}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-40">
              <Trash2 className="w-4 h-4" />{' '}{t('حذف')}
            </button>
            <button type="button" onClick={() => setSelectedIds([])} className="h-10 px-3 rounded-xl text-sm font-semibold text-white/85 hover:bg-white/10">
              {t('إلغاء التحديد')}
            </button>
          </div>
        );
      })()}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-start text-[14.5px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 ps-4 w-8">
                  {(() => {
                    const selectable = filteredUsers.filter((u) => u.id !== currentUser?.id).map((u) => u.id);
                    const all = selectable.length > 0 && selectable.every((id) => selectedIds.includes(id));
                    return (
                      <input type="checkbox" aria-label={t('تحديد كل المستخدمين المعروضين')} className="accent-indigo-600 w-4 h-4"
                        checked={all} onChange={() => setSelectedIds(all ? [] : selectable)} />
                    );
                  })()}
                </th>
                <th className="py-3 px-4">{t('المستخدم')}</th>
                <th className="py-3 px-4">{t('رقم الهوية (Login ID)')}</th>
                <th className="py-3 px-4">{t('الدور الوظيفي')}</th>
                <th className="py-3 px-4">{t('تمت الإضافة بواسطة')}</th>
                <th className="py-3 px-4">{t('المواد والفصول المسندة')}</th>
                <th className="py-3 px-4">{t('صلاحيات المعلم الإضافية')}</th>
                <th className="py-3 px-4 text-center">{t('الإجراءات')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const studentClassId = u.class_id || u.assigned_class_ids?.[0];
                const userClass = classes.find((c) => c.id === studentClassId);
                const teacherSubIds = (u.assigned_subject_ids && u.assigned_subject_ids.length > 0)
                  ? u.assigned_subject_ids
                  : (u.specialty_id ? [u.specialty_id] : []);
                const assignedSubs = teacherSubIds
                  .map((id) => subjects.find((s) => s.id === id)?.name)
                  .filter(Boolean);

                const teacherClsIds = (u.assigned_class_ids && u.assigned_class_ids.length > 0)
                  ? u.assigned_class_ids
                  : (u.class_id ? [u.class_id] : []);
                const assignedCls = teacherClsIds
                  .map((id) => classes.find((c) => c.id === id)?.name)
                  .filter(Boolean);

                const creator = users.find((creatorUser) => creatorUser.id === u.created_by);

                return (
                  <tr
                    key={u.id}
                    className={`transition-colors ${selectedIds.includes(u.id) ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : 'hover:bg-indigo-50/20 dark:hover:bg-slate-800/40'}`}
                  >
                    <td className="py-3.5 ps-4">
                      {u.id !== currentUser?.id && (
                        <input type="checkbox" aria-label={t('تحديد {title}', { title: u.name })} className="accent-indigo-600 w-4 h-4"
                          checked={selectedIds.includes(u.id)}
                          onChange={() => setSelectedIds(selectedIds.includes(u.id) ? selectedIds.filter((x) => x !== u.id) : [...selectedIds, u.id])} />
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} role={u.role} userId={u.id} size="sm" showBadge />
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{u.name}</div>
                          <div className="text-[11px] text-slate-400">ID: {u.id}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {u.national_id}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>{u.job_title?.trim() || t('مدير نظام')}</span>
                        </span>
                      )}
                      {u.role === 'teacher' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>{u.job_title?.trim() || t('معلم')}</span>
                        </span>
                      )}
                      {u.role === 'supervisor' && (
                        <span
                          title={t('الدور في النظام: مشرف')}
                          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300"
                        >
                          <UserCog className="w-3.5 h-3.5" />
                          <span>{u.job_title?.trim() || t('مشرف')}</span>
                        </span>
                      )}
                      {u.role === 'student' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>{u.job_title?.trim() || (u.gender === 'female' ? t('طالبة') : t('طالب'))}</span>
                        </span>
                      )}
                      {u.role === 'parent' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300">
                          <UserCircle2 className="w-3.5 h-3.5" />
                          <span>{t('ولي أمر')}</span>
                        </span>
                      )}
                      {branchName(u.branch_id) && (
                        <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{branchName(u.branch_id)}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {creator ? (
                        <div className="flex items-center gap-1.5">
                          <UserCircle2 className="w-3.5 h-3.5 text-indigo-500" />
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {creator.name}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({creator.role === 'admin' ? t('أدمن') : creator.role === 'supervisor' ? t('مشرف') : t('معلم')})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">{t('— النظام')}</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {isStaffRole(u.role) && (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400 me-1">{t('المواد:')}</span>
                            {assignedSubs.length > 0 ? (
                              assignedSubs.map((sName, idx) => (
                                <span
                                  key={idx}
                                  className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md text-[10px] font-semibold"
                                >
                                  {sName}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 text-[10px]">{t('لا توجد')}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400 me-1">{t('الفصول:')}</span>
                            {assignedCls.length > 0 ? (
                              assignedCls.map((cName, idx) => (
                                <span
                                  key={idx}
                                  className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-md text-[10px] font-semibold border border-indigo-100 dark:border-indigo-900"
                                >
                                  {cName}
                                </span>
                              ))
                            ) : (
                              <span className="text-slate-400 text-[10px]">{t('الكل/غير مخصص')}</span>
                            )}
                          </div>
                        </div>
                      )}
                      {u.role === 'student' && (userClass?.name || t('غير مسكن في شعبة'))}
                      {u.role === 'parent' && (
                        <span className="text-[13px]">
                          {(u.child_ids || []).map((id) => users.find((x) => x.id === id)?.name).filter(Boolean).join(t('، ')) || t('لا يوجد أبناء مرتبطون')}
                        </span>
                      )}
                      {u.role === 'admin' && <span className="text-slate-400">{t('صلاحيات كاملة')}</span>}
                    </td>

                    <td className="py-3.5 px-4 text-xs">
                      {isStaffRole(u.role) ? (() => {
                        const perms: any = u.teacher_permissions || (u as any).permissions || {};
                        const on = PERMISSION_DEFS.filter((d) => perms[d.key]);
                        if (on.length === 0) return <span className="text-slate-400">{t('صلاحيات أساسية')}</span>;
                        return (
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {on.map((d) => (
                              <span key={d.key} className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                                {t(d.short)} ✓
                              </span>
                            ))}
                          </div>
                        );
                      })() : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {u.role === 'student' && hasPerm(currentUser, 'can_export_reports') && (
                          <button
                            onClick={() => reportFor(u)}
                            className="p-1.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                            title={t('كشف درجات الطالب PDF')}
                          >
                            <FileTextIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
                          title={t('تعديل الحساب والدور والصلاحيات')}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setPasswordResetUser(u)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 rounded-lg transition-colors"
                          title={t('إعادة تعيين كلمة المرور')}
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {u.role !== 'admin' && (
                          <button
                            onClick={() => handleDelete(u.id, u.name)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                            title={t('حذف المستخدم')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit User Modal */}
      {(showAddModal || editingUser) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingUser ? t('تعديل حساب المستخدم: {name}', { name: editingUser.name }) : t('إضافة مستخدم جديد للنظام')}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingUser(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={editingUser ? handleUpdate : handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('الاسم الكامل')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('مثال: يوسف العبدالله')}
                  value={editingUser ? editingUser.name : name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (editingUser) {
                      setEditingUser((prev) => prev ? ({ ...prev, name: e.target.value }) : null);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('رقم الهوية (للدخول)')} *
                </label>
                <input
                  type="text"
                  required
                  placeholder={t('مثال: 1010203040')}
                  value={editingUser ? editingUser.national_id : nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value);
                    if (editingUser) {
                      setEditingUser((prev) => prev ? ({ ...prev, national_id: e.target.value }) : null);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-wider"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {editingUser ? t('كلمة المرور (اتركها فارغة للإبقاء على الحالية)') : t('كلمة المرور *')}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder="••••••••"
                  value={editingUser ? (editingUser.password || '') : password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (editingUser) {
                      setEditingUser((prev) => prev ? ({ ...prev, password: e.target.value }) : null);
                    }
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {!isTeacher && (
                <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('نوع الحساب')} *
                  </label>
                  <select
                    value={editingUser ? editingUser.role : role}
                    onChange={(e) => {
                      const newR = e.target.value as Role;
                      setRole(newR);
                      if (editingUser) {
                        setEditingUser((prev) => prev ? ({ ...prev, role: newR }) : null);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    <option value="student">{t('طالب (Student)')}</option>
                    <option value="teacher">{t('معلم (Teacher)')}</option>
                    <option value="supervisor">{t('مشرف (Supervisor)')}</option>
                    <option value="admin">{t('مدير نظام (Super Admin)')}</option>
                    <option value="parent">{t('ولي أمر (Parent)')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="user-job-title" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('الدور / المسمى (اكتبه)')}</label>
                  <input id="user-job-title" type="text" list="job-title-suggestions" maxLength={60}
                    value={editingUser ? (editingUser.job_title || '') : jobTitle}
                    onChange={(e) => {
                      setJobTitle(e.target.value);
                      if (editingUser) setEditingUser((prev) => (prev ? { ...prev, job_title: e.target.value } : null));
                    }}
                    placeholder={t('مثال: وكيل شؤون الطلاب')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <datalist id="job-title-suggestions">
                    {['قائد المدرسة', 'وكيل شؤون الطلاب', 'وكيل الشؤون التعليمية', 'وكيل الشؤون المدرسية', 'مرشد طلابي', 'رائد نشاط', 'رئيس قسم', 'منسق الجودة', 'معلم ومشرف', 'مساعد إداري', 'محضّر مختبر'].map((x) => <option key={x} value={t(x)} />)}
                  </datalist>
                </div>
                <p className="col-span-2 -mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t('نوع الحساب يحدد ما يستطيع فعله (مع الصلاحيات أدناه)، والدور المكتوب هو ما يظهر في المنصة.')}</p>
                </div>
              )}

              <div className={`grid gap-3 ${isAdminUser && branches.length > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                  <label htmlFor="user-gender" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('النوع')}</label>
                  <select id="user-gender" value={gender} onChange={(e) => setGender(e.target.value as Gender | '')}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                    <option value="">{t('غير محدد')}</option>
                    <option value="male">{t('ذكر')}</option>
                    <option value="female">{t('أنثى')}</option>
                  </select>
                </div>
                {isAdminUser && branches.length > 0 && (
                  <div>
                    <label htmlFor="user-branch" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{t('الفرع')}</label>
                    <select id="user-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
                      <option value="">{t('بدون فرع (يرى كل الفروع)')}</option>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {isAdminUser && (editingUser ? editingUser.role : role) === 'parent' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    {t('الأبناء المرتبطون (')}{childIds.length})
                  </label>
                  <input value={childSearch} onChange={(e) => setChildSearch(e.target.value)} placeholder={t('ابحث عن طالب بالاسم أو الهوية')} aria-label={t('بحث عن طالب')}
                    className="w-full px-3 py-2 mb-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" />
                  <div className="max-h-40 overflow-y-auto p-1.5 border rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 space-y-1">
                    {users
                      .filter((x) => x.role === 'student')
                      .filter((x) => childIds.includes(x.id) || (childSearch.trim() && (x.name.includes(childSearch.trim()) || x.national_id.includes(childSearch.trim()))))
                      .slice(0, 30)
                      .map((x) => {
                        const on = childIds.includes(x.id);
                        return (
                          <label key={x.id} className={`flex items-center justify-between gap-2 p-2 rounded-lg text-xs cursor-pointer ${on ? 'bg-indigo-50 dark:bg-indigo-950/60 font-bold text-indigo-900 dark:text-indigo-200' : 'hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                            <span>{x.name} <span className="font-mono text-slate-400">{x.national_id}</span></span>
                            <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={on}
                              onChange={() => setChildIds((prev) => (on ? prev.filter((id) => id !== x.id) : [...prev, x.id]))} />
                          </label>
                        );
                      })}
                    {childIds.length === 0 && !childSearch.trim() && <p className="p-2 text-[12px] text-slate-500">{t('اكتب اسم الطالب أو هويته لإضافته')}</p>}
                  </div>
                </div>
              )}


              {((editingUser ? editingUser.role : role) === 'student') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {t('الصف الدراسي والشعبة')}
                  </label>
                  <select
                    value={editingUser ? (editingUser.class_id || editingUser.assigned_class_ids?.[0] || classId) : classId}
                    onChange={(e) => {
                      const newCid = e.target.value;
                      setClassId(newCid);
                      setAssignedClassIds([newCid]);
                      if (editingUser) {
                        setEditingUser((prev) => prev ? ({
                          ...prev,
                          class_id: newCid,
                          assigned_class_ids: [newCid],
                        }) : null);
                      }
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {!editingUser && (
                      <option value="" disabled>
                        {t('— اختر الصف الدراسي —')}
                      </option>
                    )}
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {isStaffRole(editingUser ? editingUser.role : role) && !isTeacher && (
                <>
                  {/* المواد المسندة */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('المواد المسندة (اختر مادة أو أكثر):')}
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 border rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                      {subjects.map((s) => {
                        const isSelected = editingUser
                          ? (editingUser.assigned_subject_ids || []).includes(s.id)
                          : assignedSubjectIds.includes(s.id);
                        return (
                          <div
                            key={s.id}
                            onClick={() => toggleSubjectAssignment(s.id)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all select-none ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 font-bold text-indigo-900 dark:text-indigo-200 shadow-sm'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            }`}
                          >
                            <span>{s.name}</span>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Controlled by container click
                              className="accent-indigo-600 w-4 h-4 rounded cursor-pointer pointer-events-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* الفصول والشعب المسندة */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      {t('الفصول والشعب المسندة (اختر فصل أو أكثر):')}
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 border rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                      {classes.map((c) => {
                        const isSelected = editingUser
                          ? (editingUser.assigned_class_ids || []).includes(c.id)
                          : assignedClassIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleClassAssignment(c.id)}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-all select-none ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/80 font-bold text-indigo-900 dark:text-indigo-200 shadow-sm'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            }`}
                          >
                            <span>{c.name}</span>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Controlled by container click
                              className="accent-indigo-600 w-4 h-4 rounded cursor-pointer pointer-events-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* الصلاحيات الإضافية */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-2">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      <span>{t('الصلاحيات الإضافية:')}</span>
                    </div>
                    {(editingUser ? editingUser.role : role) === 'supervisor' && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        {t('نطاق المشرف هو الصفوف والمواد المحددة أعلاه (بدونها لا يرى أي بيانات). صلاحية «عرض جميع التقارير» تفتح له كل البيانات.')}
                      </p>
                    )}

                    {PERM_GROUPS.map((group) => (
                      <div key={group} className="space-y-1">
                        <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 pt-1.5">{t(group)}</p>
                        {PERMISSION_DEFS.filter((d) => d.group === group).map((perm) => {
                          const curPerms: any = editingUser?.teacher_permissions || teacherPermissions;
                          const roleNow = editingUser ? editingUser.role : role;
                          const locked = roleNow === 'teacher' && TEACHER_ALWAYS.has(perm.key);
                          return (
                            <div
                              key={perm.key}
                              onClick={() => !locked && togglePermissionKey(perm.key as keyof TeacherPermissions)}
                              className={`flex items-center justify-between p-2 rounded-xl transition-colors select-none ${locked ? 'opacity-70' : 'hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer'}`}
                            >
                              <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                                {t(perm.label)} ({perm.key}){locked ? t(' — مفعّلة افتراضياً للمعلم') : ''}
                              </span>
                              <input
                                type="checkbox"
                                checked={!!curPerms[perm.key] || locked}
                                readOnly
                                className="accent-indigo-600 w-4 h-4 rounded cursor-pointer pointer-events-none"
                              />
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* أزرار الحفظ والإلغاء */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {t('إلغاء')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
                >
                  {editingUser ? t('حفظ التعديلات') : t('إضافة المستخدم')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {passwordResetUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <span>{t('إعادة تعيين كلمة المرور')}</span>
              </h3>
              <button
                onClick={() => {
                  setPasswordResetUser(null);
                  setNewPasswordValue('');
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
              {t('أدخل كلمة المرور الجديدة للمستخدم:')}{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                {passwordResetUser.name}
              </span>
            </p>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('كلمة المرور الجديدة')} *
                </label>
                <input
                  type="password"
                  required
                  placeholder={t('أدخل كلمة المرور الجديدة')}
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setPasswordResetUser(null);
                    setNewPasswordValue('');
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  {t('إلغاء')}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md shadow-amber-600/20 transition-all hover:scale-105"
                >
                  {t('تغيير كلمة المرور')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Error Display */}
      {importError && (
        <div className="fixed bottom-6 end-6 start-6 sm:end-auto sm:start-6 sm:w-96 z-50 bg-rose-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom">
          <span className="text-xs font-bold">{importError}</span>
          <button onClick={() => setImportError('')} className="p-1 hover:bg-rose-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Excel Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                {t('معاينة بيانات الطلاب المستوردة (')}{importPreview.length}{' '}{t('طالب)')}
              </h3>
              <button
                onClick={() => { setShowImportModal(false); setImportPreview([]); }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {importPreview.length > 0 && (
              <div className="mb-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {t('صف افتراضي للطلاب الذين لم يُطابق صفهم في الملف:')}
                </label>
                <select
                  aria-label={t('الصف الافتراضي للاستيراد')}
                  value={importDefaultClassId}
                  onChange={(e) => setImportDefaultClassId(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">{t('— بدون (أختار لكل طالب) —')}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {importPreview.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">{t('الاسم')}</th>
                      <th className="py-2 px-3">{t('رقم الهوية')}</th>
                      <th className="py-2 px-3">{t('كلمة السر')}</th>
                      <th className="py-2 px-3">{t('الصف / الشعبة')}</th>
                      <th className="py-2 px-3">{t('النوع / الفرع')}</th>
                      <th className="py-2 px-3">{t('ولي الأمر')}</th>
                      <th className="py-2 px-3">{t('الحالة')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importPreview.map((s, i) => {
                      const alreadyExists = users.some((u) => u.national_id === s.national_id);
                      const rc = resolveImportRow(i, s.class_name);
                      return (
                        <tr key={i} className={alreadyExists ? 'bg-amber-50 dark:bg-amber-950/30' : ''}>
                          <td className="py-2 px-3 text-slate-400">{i + 1}</td>
                          <td className="py-2 px-3 text-slate-900 dark:text-white font-semibold">{s.name}</td>
                          <td className="py-2 px-3 font-mono text-indigo-600 dark:text-indigo-400">{s.national_id}</td>
                          <td className="py-2 px-3 text-slate-500">{'•'.repeat(s.password.length)}</td>
                          <td className="py-2 px-3">
                            <select
                              aria-label={t('صف الطالب {name}', { name: s.name })}
                              value={rc.id || ''}
                              onChange={(e) =>
                                setImportClassOverrides((prev) => {
                                  const next = { ...prev };
                                  if (e.target.value) next[i] = e.target.value;
                                  else delete next[i];
                                  return next;
                                })
                              }
                              className={`w-full max-w-[16rem] px-2 py-1 text-[11px] rounded-lg border bg-white dark:bg-slate-800 text-slate-900 dark:text-white ${
                                rc.id
                                  ? rc.status === 'exact' || rc.status === 'manual'
                                    ? 'border-emerald-300 dark:border-emerald-800'
                                    : 'border-amber-300 dark:border-amber-700'
                                  : 'border-rose-400 dark:border-rose-700'
                              }`}
                            >
                              <option value="">{t('— اختر الصف —')}</option>
                              {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            {rc.status === 'partial' && (
                              <span className="block text-[10px] text-amber-600 mt-0.5">{t('تطابق جزئي مع:')}{' '}{s.class_name}</span>
                            )}
                            {rc.status === 'default' && (
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                {t('صف افتراضي (في الملف:')}{' '}{s.class_name || t('فارغ')})
                              </span>
                            )}
                            {!rc.id && (
                              <span className="block text-[10px] text-rose-600 mt-0.5">
                                {rc.status === 'ambiguous' ? t('الاسم ينطبق على أكثر من صف') : t('لم يُطابق أي صف')}
                                {s.class_name ? ` (${t('في الملف: {name}', { name: s.class_name })})` : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300">
                            {s.gender === 'female' ? t('أنثى') : s.gender === 'male' ? t('ذكر') : '—'}
                            {s.branch_name && (
                              <span className={`block text-[10px] ${isAdminUser && !resolveBranch(s.branch_name) ? 'text-rose-600' : 'text-slate-400'}`}>
                                {s.branch_name}{isAdminUser && !resolveBranch(s.branch_name) ? t(' (فرع غير موجود)') : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-300">{s.parent_id || '—'}</td>
                          <td className="py-2 px-3">
                            {alreadyExists ? (
                              <span className="text-amber-600 text-[10px] font-bold">{t('مسجل مسبقاً')}</span>
                            ) : (
                              <span className="text-emerald-600 text-[10px] font-bold">{t('جاهز')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[10px] text-slate-400">
                {importPreview.filter((s) => !users.some((u) => u.national_id === s.national_id)).length}{' '}{t('طالب جديد سيتم إضافته')}
                {importUnresolvedCount > 0 && (
                  <span className="block text-rose-600 font-bold text-[11px]">
                    {importUnresolvedCount}{' '}{t('طالب بدون صف — اختر لهم صفاً قبل الاستيراد')}
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowImportModal(false); setImportPreview([]); }}
                  className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold"
                >
                  {t('إلغاء')}
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={isImporting || importUnresolvedCount > 0 || importPreview.filter((s) => !users.some((u) => u.national_id === s.national_id)).length === 0}
                  className="px-6 py-2 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      {t('جاري الاستيراد...')}
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      {t('استيراد الطلاب الآن')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
