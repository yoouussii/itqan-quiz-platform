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
  Edit2,
  KeyRound,
  Sliders,
  UserCircle2,
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

  // التحقق من صلاحية إضافة الطلاب
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
    
    // استرجاع المواد المسندة أو المادة الرئيسية
    const subIds = u.assigned_subject_ids && u.assigned_subject_ids.length > 0
      ? [...u.assigned_subject_ids]
      : (u.specialty_id ? [u.specialty_id] : []);
    setAssignedSubjectIds(subIds);

    // استرجاع الفصول المسندة
    setAssignedClassIds(u.assigned_class_ids ? [...u.assigned_class_ids] : []);

    // استرجاع الصلاحيات مع القيم الافتراضية للقيم المفقودة
    setTeacherPermissions({
      can_add_custom_subjects: !!u.teacher_permissions?.can_add_custom_subjects,
      can_manage_classes: !!u.teacher_permissions?.can_manage_classes,
      can_view_all_reports: !!u.teacher_permissions?.can_view_all_reports,
      can_add_students: !!u.teacher_permissions?.can_add_students,
      can_add_teachers: !!u.teacher_permissions?.can_add_teachers,
    });
  };

  const toggleSubjectAssignment = (subjId: string) => {
    setAssignedSubjectIds((prev) =>
      prev.includes(subjId) ? prev.filter((id) => id !== subjId) : [...prev, subjId]
    );
  };

  const toggleClassAssignment = (cId: string) => {
    setAssignedClassIds((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    );
  };

  const togglePermissionKey = (key: keyof TeacherPermissions) => {
    setTeacherPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
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
      specialty_id: role === 'teacher' ? (assignedSubjectIds[0] || null) : null,
      assigned_subject_ids: role === 'teacher' ? [...assignedSubjectIds] : [],
      assigned_class_ids: role === 'teacher' ? [...assignedClassIds] : [],
      class_id: role === 'student' ? classId : null,
      teacher_permissions: role === 'teacher' ? { ...teacherPermissions } : undefined,
      created_by: currentUser?.id,
    });
    setShowAddModal(false);
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const updates: Partial<User> & { password?: string } = {
      name,
      national_id: nationalId.trim(),
      role,
      specialty_id: role === 'teacher' ? (assignedSubjectIds[0] || null) : null, // مصلح: إضافة تحديث المادة الرئيسية
      class_id: role === 'student' ? classId : null,
      assigned_subject_ids: role === 'teacher' ? [...assignedSubjectIds] : [],
      assigned_class_ids: role === 'teacher' ? [...assignedClassIds] : [],
      teacher_permissions: role === 'teacher' ? {
        can_add_custom_subjects: !!teacherPermissions.can_add_custom_subjects,
        can_manage_classes: !!teacherPermissions.can_manage_classes,
        can_view_all_reports: !!teacherPermissions.can_view_all_reports,
        can_add_students: !!teacherPermissions.can_add_students,
        can_add_teachers: !!teacherPermissions.can_add_teachers,
      } : undefined,
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
            onClick={() => handleOpenAddModal('teacher')}
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
            placeholder="بحث بالاسم، الهوية، أو البريد..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-4 pr-10 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                <th className="py-3 px-4">تمت الإضافة بواسطة</th>
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
                    <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 border rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                      {subjects.map((s) => {
                        const isSelected = assignedSubjectIds.includes(s.id);
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
                        const isSelected = assignedClassIds.includes(c.id);
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
                    ].map((perm) => (
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
                          checked={!!teacherPermissions[perm.key]}
                          onChange={() => {}} // Controlled by container click
                          className="accent-indigo-600 w-4 h-4 rounded cursor-pointer pointer-events-none"
                        />
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
    </div>
  );
};
