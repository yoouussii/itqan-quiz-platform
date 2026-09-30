import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Trash2,
  ShieldCheck,
  UserCheck,
  GraduationCap,
  X,
  Check,
  Edit2,
  KeyRound,
  Lock,
  Layers,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
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
  } = useApp();

  // 1. إضافة متغير الشرط (canAddStudent) للتحقق من صلاحية إضافة الطلاب
  const canAddStudent =
    currentUser?.role === 'admin' ||
    (currentUser?.role === 'teacher' && currentUser?.teacher_permissions?.can_add_students);

  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

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

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      !searchTerm.trim() ||
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.national_id.includes(searchTerm) ||
      (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleOpenAddModal = (defaultRole: Role = 'student') => {
    setName('');
    setNationalId('');
    setPassword('itqan123');
    setRole(defaultRole);
    setClassId(classes[0]?.id || '');
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
    setEditingUser(u);
    setName(u.name);
    setNationalId(u.national_id);
    setPassword('');
    setRole(u.role);
    setClassId(u.class_id || classes[0]?.id || '');
    setAssignedSubjectIds(u.assigned_subject_ids || (u.specialty_id ? [u.specialty_id] : []));
    setAssignedClassIds(u.assigned_class_ids || []);
    setTeacherPermissions(
      u.teacher_permissions || {
        can_add_custom_subjects: false,
        can_manage_classes: false,
        can_view_all_reports: false,
        can_add_students: false,
        can_add_teachers: false,
      }
    );
  };

  const toggleSubjectAssignment = (subjId: string) => {
    if (assignedSubjectIds.includes(subjId)) {
      setAssignedSubjectIds(assignedSubjectIds.filter((id) => id !== subjId));
    } else {
      setAssignedSubjectIds([...assignedSubjectIds, subjId]);
    }
  };

  const toggleClassAssignment = (cId: string) => {
    if (assignedClassIds.includes(cId)) {
      setAssignedClassIds(assignedClassIds.filter((id) => id !== cId));
    } else {
      setAssignedClassIds([...assignedClassIds, cId]);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    const exists = users.some((u) => u.national_id === nationalId.trim());
    if (exists) {
      alert('رقم الهوية / الرقم الأكاديمي مسجل مسبقاً لمستخدم آخر');
      return;
    }

    addUser({
      name,
      national_id: nationalId.trim(),
      password,
      role,
      specialty_id: assignedSubjectIds[0] || null,
      assigned_subject_ids: role === 'teacher' ? assignedSubjectIds : [],
      assigned_class_ids: role === 'teacher' ? assignedClassIds : [],
      class_id: role === 'student' ? classId : null,
      teacher_permissions: role === 'teacher' ? teacherPermissions : undefined,
    });
    setShowAddModal(false);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const conflict = users.some(
      (u) => u.id !== editingUser.id && u.national_id === nationalId.trim()
    );
    if (conflict) {
      alert('رقم الهوية / الرقم الأكاديمي مستخدم لحساب آخر');
      return;
    }

    const updates: Partial<User> = {
      name,
      national_id: nationalId.trim(),
      role,
      class_id: role === 'student' ? classId : null,
      specialty_id: assignedSubjectIds[0] || null,
      assigned_subject_ids: role === 'teacher' ? assignedSubjectIds : [],
      assigned_class_ids: role === 'teacher' ? assignedClassIds : [],
      teacher_permissions: role === 'teacher' ? teacherPermissions : undefined,
    };

    if (password.trim()) {
      updates.password = password.trim();
    }

    updateUserData(editingUser.id, updates);
    setEditingUser(null);
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

        <div className="flex items-center gap-3">
          {/* 2. زر إضافة طالب جديد يعتمد ظهورُه على الشرط canAddStudent */}
          {canAddStudent && (
            <button
              onClick={() => handleOpenAddModal('student')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة طالب جديد</span>
            </button>
          )}

          <button
            onClick={() => handleOpenAddModal('student')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all hover:scale-105"
          >
            <UserPlus className="w-4 h-4" />
            <span>إضافة مستخدم جديد</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-soft flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="ابحث بالاسم أو رقم الهوية..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-10 pl-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold"
          >
            <option value="all">كافة الأدوار ({users.length})</option>
            <option value="admin">مديرو النظام</option>
            <option value="teacher">المعلمون</option>
            <option value="student">الطلاب</option>
          </select>
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
                <th className="py-3 px-4">المواد والفصول المسندة</th>
                <th className="py-3 px-4">صلاحيات المعلم الإضافية</th>
                <th className="py-3 px-4 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredUsers.map((u) => {
                const userClass = classes.find((c) => c.id === u.class_id);
                const assignedSubs = (u.assigned_subject_ids || [])
                  .map((id) => subjects.find((s) => s.id === id)?.name)
                  .filter(Boolean);

                const assignedCls = (u.assigned_class_ids || [])
                  .map((id) => classes.find((c) => c.id === id)?.name)
                  .filter(Boolean);

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
                      {u.role === 'teacher' && u.teacher_permissions ? (
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {u.teacher_permissions.can_add_students && (
                            <span className="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">
                              إضافة طلاب ✓
                            </span>
                          )}
                          {u.teacher_permissions.can_add_teachers && (
                            <span className="bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                              إضافة معلمين ✓
                            </span>
                          )}
                          {u.teacher_permissions.can_add_custom_subjects && (
                            <span className="bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded">
                              إضافة مواد ✓
                            </span>
                          )}
                          {u.teacher_permissions.can_manage_classes && (
                            <span className="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">
                              إدارة شعب ✓
                            </span>
                          )}
                          {u.teacher_permissions.can_view_all_reports && (
                            <span className="bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                              تقارير عامة ✓
                            </span>
                          )}
                        </div>
                      ) : (
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
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value)}
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الدور في النظام (Role) *
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                >
                  <option value="student">طالب (Student)</option>
                  <option value="teacher">معلم (Teacher)</option>
                  <option value="admin">مدير نظام (Super Admin)</option>
                </select>
              </div>

              {role === 'student' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الصف الدراسي والشعبة
                  </label>
                  <select
                    value={classId}
                    onChange={(e) => setClassId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {role === 'teacher' && (
                <>
                  {/* المواد المسندة */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      المواد المسندة للمعلم (اختر مادة أو أكثر):
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1 border rounded-xl border-slate-200 dark:border-slate-700">
                      {subjects.map((s) => {
                        const isSelected = assignedSubjectIds.includes(s.id);
                        return (
                          <div
                            key={s.id}
                            onClick={() => toggleSubjectAssignment(s.id)}
                            className={`p-2 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 font-bold text-indigo-900 dark:text-indigo-200'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span>{s.name}</span>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="accent-indigo-600"
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
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-1 border rounded-xl border-slate-200 dark:border-slate-700">
                      {classes.map((c) => {
                        const isSelected = assignedClassIds.includes(c.id);
                        return (
                          <div
                            key={c.id}
                            onClick={() => toggleClassAssignment(c.id)}
                            className={`p-2 rounded-xl border text-xs cursor-pointer flex items-center justify-between transition-colors ${
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950 font-bold text-indigo-900 dark:text-indigo-200'
                                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span>{c.name}</span>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              className="accent-indigo-600"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* الصلاحيات الإضافية */}
                  <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                      <Sliders className="w-4 h-4 text-indigo-600" />
                      <span>الصلاحيات الإضافية للمعلم:</span>
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherPermissions.can_add_students || false}
                        onChange={(e) =>
                          setTeacherPermissions({
                            ...teacherPermissions,
                            can_add_students: e.target.checked,
                          })
                        }
                        className="accent-indigo-600 w-4 h-4 rounded"
                      />
                      <span>صلاحية إضافة طلاب جدد (can_add_students)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherPermissions.can_add_teachers || false}
                        onChange={(e) =>
                          setTeacherPermissions({
                            ...teacherPermissions,
                            can_add_teachers: e.target.checked,
                          })
                        }
                        className="accent-indigo-600 w-4 h-4 rounded"
                      />
                      <span>صلاحية إضافة معلمين (can_add_teachers)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherPermissions.can_add_custom_subjects || false}
                        onChange={(e) =>
                          setTeacherPermissions({
                            ...teacherPermissions,
                            can_add_custom_subjects: e.target.checked,
                          })
                        }
                        className="accent-indigo-600 w-4 h-4 rounded"
                      />
                      <span>صلاحية إضافة مواد دراسية (can_add_custom_subjects)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherPermissions.can_manage_classes || false}
                        onChange={(e) =>
                          setTeacherPermissions({
                            ...teacherPermissions,
                            can_manage_classes: e.target.checked,
                          })
                        }
                        className="accent-indigo-600 w-4 h-4 rounded"
                      />
                      <span>صلاحية إدارة الفصول والشعب (can_manage_classes)</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={teacherPermissions.can_view_all_reports || false}
                        onChange={(e) =>
                          setTeacherPermissions({
                            ...teacherPermissions,
                            can_view_all_reports: e.target.checked,
                          })
                        }
                        className="accent-indigo-600 w-4 h-4 rounded"
                      />
                      <span>صلاحية الاطلاع على التقارير الشاملة (can_view_all_reports)</span>
                    </label>
                  </div>
                </>
              )}

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingUser(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {passwordResetUser && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  إعادة تعيين كلمة المرور
                </h3>
              </div>
              <button
                onClick={() => setPasswordResetUser(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handlePasswordResetSubmit} className="space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                تعيين كلمة مرور جديدة للمستخدم:{' '}
                <span className="font-bold text-slate-900 dark:text-white">
                  {passwordResetUser.name}
                </span>
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  كلمة المرور الجديدة *
                </label>
                <input
                  type="text"
                  required
                  placeholder="أدخل كلمة المرور الجديدة"
                  value={newPasswordValue}
                  onChange={(e) => setNewPasswordValue(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordResetUser(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20"
                >
                  تأكيد التغيير
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
