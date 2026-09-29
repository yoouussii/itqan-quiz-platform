import React, { useState } from 'react';
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
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Subject, SchoolClass } from '../../types';

export const SubjectsClassesManagement: React.FC = () => {
  const {
    currentUser,
    subjects,
    classes,
    addSubject,
    updateSubjectData,
    deleteSubjectItem,
    addClass,
    updateClassData,
    deleteClassItem,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'subjects' | 'classes'>('subjects');

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

  // Check permissions
  const canManageSubjects =
    currentUser?.role === 'admin' ||
    !!currentUser?.teacher_permissions?.can_add_custom_subjects;

  const canManageClasses =
    currentUser?.role === 'admin' ||
    !!currentUser?.teacher_permissions?.can_manage_classes;

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

  const handleSaveSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjName.trim()) return;

    if (editingSubject) {
      updateSubjectData(editingSubject.id, {
        name: subjName.trim(),
        code: subjCode.trim().toUpperCase() || 'SUBJ',
        color: subjColor,
        description: subjDesc.trim(),
      });
      setEditingSubject(null);
    } else {
      addSubject({
        name: subjName.trim(),
        code: subjCode.trim().toUpperCase() || `SUBJ-${Date.now().toString().slice(-3)}`,
        color: subjColor,
        description: subjDesc.trim(),
        icon: 'BookOpen',
      });
      setShowAddSubject(false);
    }
  };

  const handleDeleteSubject = (s: Subject) => {
    if (window.confirm(`هل أنت متأكد من حذف مادة (${s.name})؟`)) {
      deleteSubjectItem(s.id);
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

  const handleSaveClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    if (editingClass) {
      updateClassData(editingClass.id, {
        name: className.trim(),
        grade_level: gradeLevel.trim() || 'المرحلة الدراسية',
      });
      setEditingClass(null);
    } else {
      addClass({
        name: className.trim(),
        grade_level: gradeLevel.trim() || 'المرحلة الدراسية',
      });
      setShowAddClass(false);
    }
  };

  const handleDeleteClass = (c: SchoolClass) => {
    if (window.confirm(`هل أنت متأكد من حذف الشعبة (${c.name})؟`)) {
      deleteClassItem(c.id);
    }
  };

  const colorPresets = ['#4f46e5', '#059669', '#d97706', '#0891b2', '#7c3aed', '#e11d48', '#2563eb'];

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6" dir="rtl">
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
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
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
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleOpenEditClass(cls)}
                      className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>تعديل</span>
                    </button>
                    <button
                      onClick={() => handleDeleteClass(cls)}
                      className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
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
    </div>
  );
};
