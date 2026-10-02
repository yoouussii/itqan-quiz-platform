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
import { useApp } from '../../context/AppContext';
import { DEFAULT_PASSWORD } from '../../services/storage';
import { resolveClass } from '../../utils/classMatch';
import { Role, User, TeacherPermissions } from '../../types';
import { Avatar } from '../common/Avatar';

export const UsersManagement: React.FC = () => {
  const {
    currentUser,
    users,
    classes,
    subjects,
    addUser,
    updateUserData,
    resetUserPassword,
    deleteUserItem,
    refreshData,
  } = useApp();

  // التحقق من صلاحية إضافة الطلاب
  const canAddStudent =
    currentUser?.role === 'admin' ||
    (currentUser?.role === 'teacher' && currentUser?.teacher_permissions?.can_add_students);

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
  const [importPreview, setImportPreview] = useState<Array<{ name: string; national_id: string; password: string; class_name: string }>>([]);
  const [importError, setImportError] = useState('');
  // اختيار الصف يدوياً لكل صف في الملف + صف افتراضي لغير المطابقين
  const [importClassOverrides, setImportClassOverrides] = useState<Record<number, string>>({});
  const [importDefaultClassId, setImportDefaultClassId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTeacher = currentUser?.role === 'teacher';

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
    return matchesSearch && matchesRole && matchesClass;
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
    setRole(defaultRole);
    // لا نختار صفاً تلقائياً (إلا إذا كان الوحيد) حتى لا يُحفظ الطالب في أول صف دون قصد
    setClassId(classes.length === 1 ? classes[0].id : '');
    setAssignedSubjectIds([]);
    setAssignedClassIds([]);
    setTeacherPermissions({
      can_add_custom_subjects: false,
      can_manage_classes: false,
      can_view_all_reports: false,
      can_add_students: false,
      can_add_teachers: false,
    });
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
    const p = u.teacher_permissions || (u as any).permissions || {};
    const perms: TeacherPermissions = {
      can_add_custom_subjects: !!p.can_add_custom_subjects,
      can_manage_classes: !!p.can_manage_classes,
      can_view_all_reports: !!p.can_view_all_reports,
      can_add_students: !!p.can_add_students,
      can_add_teachers: !!p.can_add_teachers,
    };

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
      alert('رقم الهوية / الرقم الأكاديمي مسجل مسبقاً لمستخدم آخر');
      return;
    }

    // المعلم يضيف طلاباً فقط دائماً
    const effectiveRole: Role = isTeacher ? 'student' : role;

    if (effectiveRole === 'student' && !classId) {
      alert('يرجى اختيار الصف الدراسي للطالب');
      return;
    }
    const permsObj: TeacherPermissions | undefined = effectiveRole === 'teacher' ? {
      can_add_custom_subjects: !!teacherPermissions.can_add_custom_subjects,
      can_manage_classes: !!teacherPermissions.can_manage_classes,
      can_view_all_reports: !!teacherPermissions.can_view_all_reports,
      can_add_students: !!teacherPermissions.can_add_students,
      can_add_teachers: !!teacherPermissions.can_add_teachers,
    } : undefined;

    await addUser({
      name: name.trim(),
      national_id: nationalId.trim(),
      username: nationalId.trim(),
      email: `${nationalId.trim()}@itqan.edu.sa`,
      password,
      role: effectiveRole,
      specialty_id: effectiveRole === 'teacher' ? (assignedSubjectIds[0] || null) : null,
      assigned_subject_ids: effectiveRole === 'teacher' ? [...assignedSubjectIds] : [],
      assigned_class_ids: effectiveRole === 'teacher' ? [...assignedClassIds] : (effectiveRole === 'student' ? [classId] : []),
      class_id: effectiveRole === 'student' ? classId : (assignedClassIds[0] || null),
      teacher_permissions: permsObj,
      permissions: permsObj,
      created_by: currentUser?.id,
    });
    setShowAddModal(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const effectiveRole: Role = isTeacher ? 'student' : (editingUser.role || role);
    const currentPerms = editingUser.teacher_permissions || teacherPermissions;
    const permsObj: TeacherPermissions | undefined = effectiveRole === 'teacher' ? {
      can_add_custom_subjects: !!currentPerms.can_add_custom_subjects,
      can_manage_classes: !!currentPerms.can_manage_classes,
      can_view_all_reports: !!currentPerms.can_view_all_reports,
      can_add_students: !!currentPerms.can_add_students,
      can_add_teachers: !!currentPerms.can_add_teachers,
    } : undefined;

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
    const unifiedSpecialtyId = effectiveRole === 'teacher' ? (teacherSubs[0] || null) : null;
    const unifiedAssignedSubjectIds = effectiveRole === 'teacher' ? [...teacherSubs] : [];

    const updates: Partial<User> & { password?: string } = {
      name: currentName,
      national_id: currentNationalId,
      username: currentNationalId,
      email: editingUser.email || `${currentNationalId}@itqan.edu.sa`,
      role: effectiveRole,
      specialty_id: unifiedSpecialtyId,
      assigned_subject_ids: unifiedAssignedSubjectIds,
      class_id: unifiedClassId,
      assigned_class_ids: unifiedAssignedClassIds,
      teacher_permissions: permsObj,
      permissions: permsObj,
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
    if (window.confirm(`هل أنت متأكد من حذف المستخدم (${userName}) نهائياً من منصة إتقان؟`)) {
      deleteUserItem(id);
    }
  };

  // === Excel Import Functions ===
  const downloadExcelTemplate = () => {
    const templateData = [
      { 'الاسم': 'أحمد محمد', 'رقم الهوية': '1234567890', 'كلمة السر': '123456', 'الصف / الشعبة': 'الصف الأول أ' },
      { 'الاسم': 'سارة علي', 'رقم الهوية': '0987654321', 'كلمة السر': '123456', 'الصف / الشعبة': 'الصف الثاني ب' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'طلاب');
    ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 20 }];
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
          setImportError('الملف فارغ أو لا يحتوي على بيانات صالحة');
          return;
        }

        const parsed = jsonData.map((row: any) => ({
          name: String(row['الاسم'] || row['name'] || row['Name'] || '').trim(),
          national_id: String(row['رقم الهوية'] || row['اسم المستخدم'] || row['national_id'] || row['username'] || row['ID'] || '').trim(),
          password: String(row['كلمة السر'] || row['password'] || row['Password'] || DEFAULT_PASSWORD).trim(),
          class_name: String(row['الصف / الشعبة'] || row['الصف'] || row['class'] || row['Class'] || '').trim(),
        })).filter((s) => s.name && s.national_id);

        if (parsed.length === 0) {
          setImportError('لم يتم العثور على بيانات صالحة. تأكد من وجود أعمدة: الاسم، رقم الهوية');
          return;
        }

        setImportPreview(parsed);
        setImportClassOverrides({});
        setImportDefaultClassId('');
        setShowImportModal(true);
      } catch (err) {
        console.error('Excel parse error:', err);
        setImportError('حدث خطأ أثناء قراءة الملف. تأكد من أنه ملف Excel صالح (.xlsx)');
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

      for (let idx = 0; idx < importPreview.length; idx++) {
        const student = importPreview[idx];
        const exists = users.some((u) => u.national_id === student.national_id);
        if (exists) {
          skippedCount++;
          continue;
        }

        const classId = resolveImportRow(idx, student.class_name).id;
        if (!classId) {
          // لا نضع الطالب في صف عشوائي: يُتخطى (الزر معطّل أصلاً حتى تُحسم كل الصفوف)
          skippedCount++;
          continue;
        }

        await addUser({
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
          created_by: currentUser?.id,
        });
        importedCount++;
      }

      setShowImportModal(false);
      setImportPreview([]);

      const msg = skippedCount > 0
        ? `تم استيراد ${importedCount} طالب بنجاح، وتم تخطي ${skippedCount} (مسجل مسبقاً أو بدون صف محدد)`
        : `تم استيراد ${importedCount} طالب بنجاح`;
      alert(msg);
    } catch (err) {
      console.error('Bulk import error:', err);
      alert('حدث خطأ أثناء الاستيراد. تحقق من البيانات وأعد المحاولة.');
    } finally {
      setIsImporting(false);
    }
  };

  const importUnresolvedCount = importPreview.filter(
    (s, i) => !users.some((u) => u.national_id === s.national_id) && !resolveImportRow(i, s.class_name).id
  ).length;

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            إدارة الكادر التعليمي والطلاب (User Management & RBAC)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            التحكم الكامل في الحسابات، أرقام الهوية، الصلاحيات الدقيقة للمعلمين، وتبديل الأدوار
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isTeacher && canAddStudent && (
            <button
              onClick={() => handleOpenAddModal('student')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة طالب جديد</span>
            </button>
          )}

          {canAddStudent && (
            <>
              <button
                onClick={downloadExcelTemplate}
                className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-105"
                title="تحميل نموذج Excel"
              >
                <Download className="w-4 h-4" />
                <span>تحميل نموذج Excel</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all hover:scale-105"
                title="استيراد طلاب من ملف Excel"
              >
                <Upload className="w-4 h-4" />
                <span>استيراد من Excel</span>
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
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة مستخدم جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-soft flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="بحث بالاسم، الهوية، أو البريد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-10 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {!isTeacher && (
            <select
              aria-label="تصفية حسب الدور"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
            >
              <option value="all">كافة الأدوار ({scopeUsers.length})</option>
              <option value="admin">مديرو النظام ({roleCount('admin')})</option>
              <option value="teacher">المعلمون ({roleCount('teacher')})</option>
              <option value="student">الطلاب ({roleCount('student')})</option>
            </select>
          )}

          <select
            aria-label="تصفية حسب الصف"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold max-w-[18rem]"
          >
            <option value="all">كل الصفوف</option>
            {classFilterOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({classCount(c.id)})
              </option>
            ))}
            {noClassCount > 0 && <option value="none">بدون صف ({noClassCount})</option>}
          </select>

          {(roleFilter !== 'all' || classFilter !== 'all' || searchTerm.trim()) && (
            <button
              type="button"
              onClick={() => {
                setRoleFilter('all');
                setClassFilter('all');
                setSearchTerm('');
              }}
              className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              مسح الفلاتر
            </button>
          )}
          <span className="text-[11px] text-slate-400 font-semibold">{filteredUsers.length} نتيجة</span>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-soft overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4">المستخدم</th>
                <th className="py-3 px-4">رقم الهوية (Login ID)</th>
                <th className="py-3 px-4">الدور الوظيفي</th>
                <th className="py-3 px-4">تمت الإضافة بواسطة</th>
                <th className="py-3 px-4">المواد والفصول المسندة</th>
                <th className="py-3 px-4">صلاحيات المعلم الإضافية</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
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
                    className="hover:bg-indigo-50/20 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} role={u.role} size="sm" showBadge />
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
                          <span>مدير نظام</span>
                        </span>
                      )}
                      {u.role === 'teacher' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>معلم</span>
                        </span>
                      )}
                      {u.role === 'student' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                          <GraduationCap className="w-3.5 h-3.5" />
                          <span>طالب</span>
                        </span>
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
                            ({creator.role === 'admin' ? 'أدمن' : 'معلم'})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">— النظام</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                      {u.role === 'teacher' && (
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400 ml-1">المواد:</span>
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
                              <span className="text-slate-400 text-[10px]">لا توجد</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="text-[10px] font-bold text-slate-400 ml-1">الفصول:</span>
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
                              <span className="text-slate-400 text-[10px]">الكل/غير مخصص</span>
                            )}
                          </div>
                        </div>
                      )}
                      {u.role === 'student' && (userClass?.name || 'غير مسكن في شعبة')}
                      {u.role === 'admin' && <span className="text-slate-400">صلاحيات كاملة</span>}
                    </td>

                    <td className="py-3.5 px-4 text-xs">
                      {u.role === 'teacher' ? (() => {
                        const perms = u.teacher_permissions || (u as any).permissions || {};
                        const hasAny = Object.values(perms).some(Boolean);
                        if (!hasAny) return <span className="text-slate-400">صلاحيات أساسية</span>;
                        return (
                          <div className="flex flex-wrap gap-1 text-[10px]">
                            {perms.can_add_students && (
                              <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                                إضافة طلاب ✓
                              </span>
                            )}
                            {perms.can_add_teachers && (
                              <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                                إضافة معلمين ✓
                              </span>
                            )}
                            {perms.can_add_custom_subjects && (
                              <span className="bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded">
                                إضافة مواد ✓
                              </span>
                            )}
                            {perms.can_manage_classes && (
                              <span className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                إدارة شعب ✓
                              </span>
                            )}
                            {perms.can_view_all_reports && (
                              <span className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                                تقارير عامة ✓
                              </span>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
                          title="تعديل الحساب والدور والصلاحيات"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => setPasswordResetUser(u)}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 rounded-lg transition-colors"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>

                        {u.role !== 'admin' && (
                          <button
                            onClick={() => handleDelete(u.id, u.name)}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                            title="حذف المستخدم"
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
                {editingUser ? `تعديل حساب المستخدم: ${editingUser.name}` : 'إضافة مستخدم جديد للنظام'}
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
                  الاسم الكامل *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: يوسف العبدالله"
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
                  رقم الهوية الوطنية / الأكاديمية (Login Key) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: 1010203040"
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
                  {editingUser ? 'كلمة المرور (اتركها فارغة للإبقاء على الحالية)' : 'كلمة المرور *'}
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
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الدور في النظام (Role) *
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
                    <option value="student">طالب (Student)</option>
                    <option value="teacher">معلم (Teacher)</option>
                    <option value="admin">مدير نظام (Super Admin)</option>
                  </select>
                </div>
              )}

              {((editingUser ? editingUser.role : role) === 'student') && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الصف الدراسي والشعبة
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
                        — اختر الصف الدراسي —
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

              {((editingUser ? editingUser.role : role) === 'teacher') && !isTeacher && (
                <>
                  {/* المواد المسندة */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      المواد المسندة للمعلم (اختر مادة أو أكثر):
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
                      الفصول والشعب المسندة للمعلم (اختر فصل أو أكثر):
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
                      <span>الصلاحيات الإضافية للمعلم:</span>
                    </div>

                    {[
                      { key: 'can_add_students' as const, label: 'صلاحية إضافة طلاب جدد (can_add_students)' },
                      { key: 'can_add_teachers' as const, label: 'صلاحية إضافة معلمين (can_add_teachers)' },
                      { key: 'can_add_custom_subjects' as const, label: 'صلاحية إضافة مواد دراسية (can_add_custom_subjects)' },
                      { key: 'can_manage_classes' as const, label: 'صلاحية إدارة الفصول والشعب (can_manage_classes)' },
                      { key: 'can_view_all_reports' as const, label: 'صلاحية عرض جميع التقارير (can_view_all_reports)' },
                    ].map((perm) => {
                      const curPerms = editingUser?.teacher_permissions || teacherPermissions;
                      return (
                        <div
                          key={perm.key}
                          onClick={() => togglePermissionKey(perm.key)}
                          className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700/50 cursor-pointer transition-colors select-none"
                        >
                          <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                            {perm.label}
                          </span>
                          <input
                            type="checkbox"
                            checked={!!curPerms[perm.key]}
                            onChange={() => {}} // Controlled by container click
                            className="accent-indigo-600 w-4 h-4 rounded cursor-pointer pointer-events-none"
                          />
                        </div>
                      );
                    })}
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
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
                <span>إعادة تعيين كلمة المرور</span>
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
              أدخل كلمة المرور الجديدة للمستخدم:{' '}
              <span className="font-bold text-slate-900 dark:text-white">
                {passwordResetUser.name}
              </span>
            </p>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة المرور الجديدة *
                </label>
                <input
                  type="password"
                  required
                  placeholder="أدخل كلمة المرور الجديدة"
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
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-md shadow-amber-600/20 transition-all hover:scale-105"
                >
                  تغيير كلمة المرور
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Error Display */}
      {importError && (
        <div className="fixed bottom-6 left-6 right-6 sm:left-auto sm:right-6 sm:w-96 z-50 bg-rose-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom">
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
                معاينة بيانات الطلاب المستوردة ({importPreview.length} طالب)
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
                  صف افتراضي للطلاب الذين لم يُطابق صفهم في الملف:
                </label>
                <select
                  aria-label="الصف الافتراضي للاستيراد"
                  value={importDefaultClassId}
                  onChange={(e) => setImportDefaultClassId(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">— بدون (أختار لكل طالب) —</option>
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
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-100 dark:border-slate-800">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">الاسم</th>
                      <th className="py-2 px-3">رقم الهوية</th>
                      <th className="py-2 px-3">كلمة السر</th>
                      <th className="py-2 px-3">الصف / الشعبة</th>
                      <th className="py-2 px-3">الحالة</th>
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
                              aria-label={`صف الطالب ${s.name}`}
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
                              <option value="">— اختر الصف —</option>
                              {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                            {rc.status === 'partial' && (
                              <span className="block text-[10px] text-amber-600 mt-0.5">تطابق جزئي مع: {s.class_name}</span>
                            )}
                            {rc.status === 'default' && (
                              <span className="block text-[10px] text-slate-400 mt-0.5">
                                صف افتراضي (في الملف: {s.class_name || 'فارغ'})
                              </span>
                            )}
                            {!rc.id && (
                              <span className="block text-[10px] text-rose-600 mt-0.5">
                                {rc.status === 'ambiguous' ? 'الاسم ينطبق على أكثر من صف' : 'لم يُطابق أي صف'}
                                {s.class_name ? ` (في الملف: ${s.class_name})` : ''}
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {alreadyExists ? (
                              <span className="text-amber-600 text-[10px] font-bold">مسجل مسبقاً</span>
                            ) : (
                              <span className="text-emerald-600 text-[10px] font-bold">جاهز</span>
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
                {importPreview.filter((s) => !users.some((u) => u.national_id === s.national_id)).length} طالب جديد سيتم إضافته
                {importUnresolvedCount > 0 && (
                  <span className="block text-rose-600 font-bold text-[11px]">
                    {importUnresolvedCount} طالب بدون صف — اختر لهم صفاً قبل الاستيراد
                  </span>
                )}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowImportModal(false); setImportPreview([]); }}
                  className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={isImporting || importUnresolvedCount > 0 || importPreview.filter((s) => !users.some((u) => u.national_id === s.national_id)).length === 0}
                  className="px-6 py-2 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isImporting ? (
                    <>
                      <span className="animate-spin">⏳</span>
                      جاري الاستيراد...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      استيراد الطلاب الآن
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
