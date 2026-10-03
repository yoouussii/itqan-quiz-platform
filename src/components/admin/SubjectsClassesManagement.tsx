import React, { useState, useMemo } from 'react';
import {
  Layers,
  BookOpen,
  School,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  Tag,
  Palette,
  UserCheck,
  Users,
  Building2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Subject, SchoolClass, User } from '../../types';
import { uiDir } from '../../i18n';

export const SubjectsClassesManagement: React.FC = () => {
  const {
    currentUser,
    subjects,
    classes,
    users,
    addSubject,
    updateSubjectData,
    deleteSubjectItem,
    addClass,
    updateClassData,
    deleteClassItem,
    updateUserData,
    refreshData,
    branches,
    saveBranch,
    deleteBranch,
  } = useApp();
  const isAdmin = currentUser?.role === 'admin';
  const [branchName, setBranchName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'subjects' | 'classes' | 'branches'>('subjects');

  // Subject Modals
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subjName, setSubjName] = useState('');
  const [subjCode, setSubjCode] = useState('');
  const [subjColor, setSubjColor] = useState('#4f46e5');
  const [subjDesc, setSubjDesc] = useState('');

  // Class Modals
  const [showAddClass, setShowAddClass] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [className, setClassName] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');

  // --- Assignment Modals ---
  // Subject → Assign Teachers
  const [assignSubjectTeachersModal, setAssignSubjectTeachersModal] = useState<Subject | null>(null);
  // Class → Assign Students / Teachers
  const [assignClassUsersModal, setAssignClassUsersModal] = useState<SchoolClass | null>(null);

  const teachers = useMemo(() => users.filter((u) => u.role === 'teacher'), [users]);
  const students = useMemo(() => users.filter((u) => u.role === 'student'), [users]);

  const getSubjectTeachers = (subjectId: string) =>
    teachers.filter(
      (t) =>
        t.assigned_subject_ids?.includes(subjectId) ||
        t.specialty_id === subjectId
    );

  const getClassStudents = (classId: string) =>
    students.filter((s) => s.class_id === classId || s.assigned_class_ids?.includes(classId));

  const getClassTeachers = (classId: string) =>
    teachers.filter((t) => t.assigned_class_ids?.includes(classId));

  const handleToggleSubjectTeacher = async (subjectId: string, teacher: User) => {
    const current = teacher.assigned_subject_ids || (teacher.specialty_id ? [teacher.specialty_id] : []);
    const updated = current.includes(subjectId)
      ? current.filter((id) => id !== subjectId)
      : [...current, subjectId];
    await updateUserData(teacher.id, {
      assigned_subject_ids: updated,
      specialty_id: updated[0] || null,
    });
  };

  const handleToggleClassStudent = async (classId: string, student: User) => {
    // Students belong to one class — toggle directly
    const newClassId = student.class_id === classId ? null : classId;
    await updateUserData(student.id, {
      class_id: newClassId || undefined,
      assigned_class_ids: newClassId ? [newClassId] : [],
    });
  };

  const handleToggleClassTeacher = async (classId: string, teacher: User) => {
    const current = teacher.assigned_class_ids || (teacher.class_id ? [teacher.class_id] : []);
    const updated = current.includes(classId)
      ? current.filter((id) => id !== classId)
      : [...current, classId];
    await updateUserData(teacher.id, {
      assigned_class_ids: updated,
      class_id: updated[0] || null,
    });
  };

  // Check permissions
  const canManageSubjects =
    currentUser?.role === 'admin' ||
    !!currentUser?.teacher_permissions?.can_add_custom_subjects ||
    !!(currentUser as any)?.permissions?.can_add_custom_subjects;

  const canManageClasses =
    currentUser?.role === 'admin' ||
    !!currentUser?.teacher_permissions?.can_manage_classes ||
    !!(currentUser as any)?.permissions?.can_manage_classes;

  // Handlers for Subjects
  const handleOpenAddSubject = () => {
    setSubjName('');
    setSubjCode('');
    setSubjColor('#4f46e5');
    setSubjDesc('');
    setShowAddSubject(true);
  };

  const handleOpenEditSubject = (s: Subject) => {
    setEditingSubject(s);
    setSubjName(s.name);
    setSubjCode(s.code);
    setSubjColor(s.color);
    setSubjDesc(s.description);
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjName.trim()) return;

    if (editingSubject) {
      await updateSubjectData(editingSubject.id, {
        name: subjName.trim(),
        code: subjCode.trim().toUpperCase() || 'SUBJ',
        color: subjColor,
        description: subjDesc.trim(),
      });
      setEditingSubject(null);
    } else {
      await addSubject({
        name: subjName.trim(),
        code: subjCode.trim().toUpperCase() || `SUBJ-${Date.now().toString().slice(-3)}`,
        color: subjColor,
        description: subjDesc.trim(),
        icon: 'BookOpen',
      });
      setShowAddSubject(false);
    }
    await refreshData();
  };

  const handleDeleteSubject = async (s: Subject) => {
    if (window.confirm(`هل أنت متأكد من حذف مادة (${s.name})؟`)) {
      await deleteSubjectItem(s.id);
      await refreshData();
    }
  };

  // Handlers for Classes
  const handleOpenAddClass = () => {
    setClassName('');
    setGradeLevel('المرحلة الثانوية');
    setShowAddClass(true);
  };

  const handleOpenEditClass = (c: SchoolClass) => {
    setEditingClass(c);
    setClassName(c.name);
    setGradeLevel(c.grade_level);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    if (editingClass) {
      await updateClassData(editingClass.id, {
        name: className.trim(),
        grade_level: gradeLevel.trim() || 'المرحلة الدراسية',
        // الشعب مشتركة بين كل الفروع
        ...(isAdmin ? { branch_id: null } : {}),
      });
      setEditingClass(null);
    } else {
      await addClass({
        name: className.trim(),
        grade_level: gradeLevel.trim() || 'المرحلة الدراسية',
        branch_id: null,
      });
      setShowAddClass(false);
    }
    await refreshData();
  };

  const handleDeleteClass = async (c: SchoolClass) => {
    if (window.confirm(`هل أنت متأكد من حذف الشعبة (${c.name})؟`)) {
      await deleteClassItem(c.id);
      await refreshData();
    }
  };

  const colorPresets = ['#4f46e5', '#059669', '#d97706', '#0891b2', '#7c3aed', '#e11d48', '#2563eb'];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir={uiDir()}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            إدارة المواد الدراسية والفصول والشعب
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            إضافة وتعديل مسميات المواد والشعب المدرسية المخصصة بحرية ودون قيود مسبقة
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center p-1 bg-slate-200/80 dark:bg-slate-800 rounded-2xl text-xs font-bold">
          <button
            onClick={() => setActiveTab('subjects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              activeTab === 'subjects'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>المواد الدراسية ({subjects.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('classes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
              activeTab === 'classes'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <School className="w-4 h-4" />
            <span>الفصول والشعب ({classes.length})</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveTab('branches')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
                activeTab === 'branches'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>الفروع ({branches.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab 1: Subjects Content */}
      {activeTab === 'subjects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              قائمة المواد المسجلة في النظام
            </h3>

            {canManageSubjects && (
              <button
                onClick={handleOpenAddSubject}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة مادة مخصصة</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map((subj) => (
              <div
                key={subj.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-soft flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: subj.color }}
                    />
                    <span className="text-[11px] font-mono font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                      {subj.code}
                    </span>
                  </div>

                  <h4 className="font-bold text-base text-slate-900 dark:text-white mb-1.5">
                    {subj.name}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                    {subj.description || 'مادة دراسية معتمدة ضمن المنهج الأكاديمي'}
                  </p>
                </div>

                {canManageSubjects && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setAssignSubjectTeachersModal(subj)}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>إسناد معلمين ({getSubjectTeachers(subj.id).length})</span>
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenEditSubject(subj)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>تعديل</span>
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subj)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Classes Content */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              قائمة الفصول والشعب الدراسية
            </h3>

            {canManageClasses && (
              <button
                onClick={handleOpenAddClass}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة شعبة / صف جديد</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-soft flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                      <School className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {cls.grade_level}
                    </span>
                  </div>

                  <h4 className="font-bold text-base text-slate-900 dark:text-white mb-2">
                    {cls.name}
                  </h4>
                </div>

                {canManageClasses && (
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{getClassStudents(cls.id).length}</span> طالب
                      <span className="mx-1">·</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">{getClassTeachers(cls.id).length}</span> معلم
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setAssignClassUsersModal(cls)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg text-xs font-bold flex items-center gap-1"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>إسناد الطلاب والمعلمين</span>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditClass(cls)}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-xs font-bold flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteClass(cls)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg text-xs font-bold flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: الفروع (مدير النظام) */}
      {activeTab === 'branches' && isAdmin && (
        <div className="space-y-4 max-w-3xl">
          <p className="text-[14.5px] text-slate-600 dark:text-slate-400 leading-relaxed">
            كل الشعب والمواد مشتركة بين جميع الفروع تلقائياً، فأي فرع جديد يجدها جاهزة.
            المعلم أو المشرف المسند لفرع يرى طلاب واختبارات ونتائج فرعه فقط، ومن بلا فرع يرى الكل.
            يُسند الفرع للمستخدمين من صفحة «المستخدمون» (فردياً أو بالتحديد الجماعي).
          </p>
          <form
            onSubmit={async (e) => { e.preventDefault(); if (!branchName.trim()) return; await saveBranch(branchName); setBranchName(''); }}
            className="flex gap-2"
          >
            <input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="اسم الفرع، مثل: فرع البنين" aria-label="اسم الفرع الجديد"
              className="flex-1 h-11 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[15px] text-slate-900 dark:text-white" />
            <button type="submit" className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
              <Plus className="w-4 h-4" />إضافة فرع
            </button>
          </form>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
            {branches.length === 0 && <p className="p-6 text-center text-slate-500">لا توجد فروع بعد</p>}
            {branches.map((b) => {
              const members = users.filter((u) => u.branch_id === b.id);
              const nStudents = members.filter((u) => u.role === 'student').length;
              const nStaff = members.filter((u) => u.role === 'teacher' || u.role === 'supervisor').length;
              return (
                <div key={b.id} className="flex items-center gap-3 p-4">
                  <span className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></span>
                  <div className="flex-1 min-w-0">
                    {renaming?.id === b.id ? (
                      <form onSubmit={async (e) => { e.preventDefault(); await saveBranch(renaming.name, b.id); setRenaming(null); }} className="flex gap-2">
                        <input autoFocus value={renaming.name} onChange={(e) => setRenaming({ id: b.id, name: e.target.value })} aria-label="اسم الفرع"
                          className="flex-1 h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white" />
                        <button type="submit" className="h-10 px-3 rounded-lg bg-indigo-600 text-white text-sm font-semibold" aria-label="حفظ"><Check className="w-4 h-4" /></button>
                      </form>
                    ) : (
                      <>
                        <div className="font-bold text-[15.5px] text-slate-900 dark:text-white">{b.name}</div>
                        <div className="text-[13px] text-slate-500 dark:text-slate-400">{nStudents} طالب · {nStaff} من الطاقم</div>
                      </>
                    )}
                  </div>
                  {renaming?.id !== b.id && (
                    <>
                      <button type="button" onClick={() => setRenaming({ id: b.id, name: b.name })} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="تعديل الاسم"><Edit2 className="w-4 h-4" /></button>
                      <button type="button" onClick={() => window.confirm(`حذف «${b.name}»؟ سيصبح ${members.length} مستخدم بلا فرع.`) && void deleteBranch(b.id)}
                        className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50" aria-label="حذف الفرع"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Subject Modal */}
      {(showAddSubject || editingSubject) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingSubject ? `تعديل المادة: ${editingSubject.name}` : 'إضافة مادة مخصصة جديدة'}
              </h3>
              <button
                onClick={() => {
                  setShowAddSubject(false);
                  setEditingSubject(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSubject} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اسم المادة الدراسية *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الأمن السيبراني والشبكات"
                  value={subjName}
                  onChange={(e) => setSubjName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رمز المادة (Course Code)
                </label>
                <input
                  type="text"
                  placeholder="CYBER101"
                  value={subjCode}
                  onChange={(e) => setSubjCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اللون المميز للمادة
                </label>
                <div className="flex items-center gap-2">
                  {colorPresets.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setSubjColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform ${
                        subjColor === c ? 'scale-110 border-slate-900 dark:border-white shadow-md' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  وصف مختصر للمادة
                </label>
                <textarea
                  rows={2}
                  placeholder="مفاهيم حماية البيانات واختبار الاختراق..."
                  value={subjDesc}
                  onChange={(e) => setSubjDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSubject(false);
                    setEditingSubject(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                >
                  حفظ المادة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Class Modal */}
      {(showAddClass || editingClass) && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {editingClass ? `تعديل الشعبة: ${editingClass.name}` : 'إضافة شعبة / صف جديد'}
              </h3>
              <button
                onClick={() => {
                  setShowAddClass(false);
                  setEditingClass(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اسم الصف والشعبة *
                </label>
                <input
                  type="text"
                  required
                  placeholder="مثال: الصف الثالث الثانوي - شعبة موهبة (ج)"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  المرحلة الدراسية
                </label>
                <input
                  type="text"
                  placeholder="مثال: المرحلة الثانوية - المسار التخصصي"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>


              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddClass(false);
                    setEditingClass(null);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
                >
                  حفظ الشعبة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ====== Modal: Assign Teachers to Subject ====== */}
      {assignSubjectTeachersModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  إسناد معلمين لمادة: {assignSubjectTeachersModal.name}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  اضغط على المعلم لإسناده أو إلغاء إسناده لهذه المادة فوراً
                </p>
              </div>
              <button
                onClick={() => setAssignSubjectTeachersModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {teachers.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">لا يوجد معلمون مضافون في النظام</p>
              )}
              {teachers.map((teacher) => {
                const isAssigned =
                  teacher.assigned_subject_ids?.includes(assignSubjectTeachersModal.id) ||
                  teacher.specialty_id === assignSubjectTeachersModal.id;
                return (
                  <div
                    key={teacher.id}
                    onClick={() => handleToggleSubjectTeacher(assignSubjectTeachersModal.id, teacher)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all select-none ${
                      isAssigned
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{teacher.name}</div>
                      <div className="text-[10px] text-slate-400">{teacher.national_id}</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isAssigned ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'
                    }`}>
                      {isAssigned && <Check className="w-3 h-3 text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setAssignSubjectTeachersModal(null)}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
              >
                تم الحفظ والإغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Modal: Assign Students & Teachers to Class ====== */}
      {assignClassUsersModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  إسناد الطلاب والمعلمين للشعبة: {assignClassUsersModal.name}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  اضغط على الاسم لإسناده أو إلغاء إسناده لهذا الفصل
                </p>
              </div>
              <button
                onClick={() => setAssignClassUsersModal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Students Section */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">الطلاب</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">
                  ({getClassStudents(assignClassUsersModal.id).length} مسند)
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {students.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">لا يوجد طلاب مضافون</p>
                )}
                {students.map((student) => {
                  const isAssigned =
                    student.class_id === assignClassUsersModal.id ||
                    student.assigned_class_ids?.includes(assignClassUsersModal.id);
                  return (
                    <div
                      key={student.id}
                      onClick={() => handleToggleClassStudent(assignClassUsersModal.id, student)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                        isAssigned
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{student.name}</div>
                        <div className="text-[10px] text-slate-400">{student.national_id}</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isAssigned ? 'border-emerald-500 bg-emerald-500' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {isAssigned && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Teachers Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">المعلمون</span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold">
                  ({getClassTeachers(assignClassUsersModal.id).length} مسند)
                </span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {teachers.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-2">لا يوجد معلمون مضافون</p>
                )}
                {teachers.map((teacher) => {
                  const isAssigned = teacher.assigned_class_ids?.includes(assignClassUsersModal.id);
                  return (
                    <div
                      key={teacher.id}
                      onClick={() => handleToggleClassTeacher(assignClassUsersModal.id, teacher)}
                      className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                        isAssigned
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{teacher.name}</div>
                        <div className="text-[10px] text-slate-400">{teacher.national_id}</div>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isAssigned ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'
                      }`}>
                        {isAssigned && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setAssignClassUsersModal(null)}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl"
              >
                تم الحفظ والإغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
