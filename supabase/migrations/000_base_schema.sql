-- =====================================================================
-- منصة إتقان: 000 — الجداول الأساسية (لمدرسة جديدة بقاعدة بيانات فارغة)
--
-- يُشغَّل تلقائياً من سكربت إعداد مدرسة جديدة (scripts/setup-school.sh).
-- على قاعدة بيانات قائمة لا يغيّر شيئاً (create table if not exists).
-- باقي الأعمدة والحماية تضيفها الملفات 001 ← آخر ملف.
-- =====================================================================

create table if not exists public.users (
  id text primary key,
  name text,
  email text,
  password text not null,
  role text check (role in ('admin', 'teacher', 'student')),
  username text,
  national_id text unique,
  specialty_id text,
  class_id text,
  assigned_subject_ids jsonb default '[]',
  assigned_class_ids jsonb default '[]',
  permissions jsonb default '{}',
  teacher_permissions jsonb default '{}',
  created_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.subjects (
  id text primary key, name text, code text, color text, description text, icon text, created_by text
);

create table if not exists public.classes (
  id text primary key, name text, grade_level text, student_count integer default 0, created_by text
);

create table if not exists public.quizzes (
  id text primary key,
  title text, description text, teacher_id text, created_by text, subject_id text,
  duration_minutes numeric, total_marks numeric, pass_percentage numeric,
  status text, review_note text,
  start_date timestamptz, end_date timestamptz,
  is_active boolean default true, is_deleted boolean default false, deleted_at timestamptz,
  allowed_retake_student_ids text[] default '{}',
  target_type text, class_id text, student_ids text[] default '{}',
  questions jsonb default '[]', assignments jsonb default '[]',
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.submissions (
  id text primary key,
  quiz_id text, student_id text,
  score numeric, total_possible_score numeric, percentage numeric,
  answers_json jsonb default '[]',
  completed_at timestamptz default now(),
  status text, time_spent_seconds integer, is_retake boolean default false,
  created_at timestamptz default now()
);

select '✓ 000: الجداول الأساسية جاهزة' as result;
