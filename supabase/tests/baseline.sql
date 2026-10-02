-- نسخة تقريبية من قاعدة البيانات قبل الحماية (للاختبار المحلي فقط — لا تُشغَّل على Supabase)
create table public.users (
  id text primary key, name text, email text, password text, role text check (role in ('admin','teacher','student')),
  username text, national_id text unique, specialty_id text, class_id text,
  assigned_subject_ids jsonb default '[]', assigned_class_ids jsonb default '[]',
  permissions jsonb default '{}', teacher_permissions jsonb default '{}',
  created_by text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.subjects (id text primary key, name text, code text, color text, description text, icon text, created_by text);
create table public.classes (id text primary key, name text, grade_level text, student_count integer default 0, created_by text);
create table public.quizzes (
  id text primary key, title text, description text, teacher_id text, created_by text, subject_id text,
  duration_minutes numeric, total_marks numeric, pass_percentage numeric, status text, review_note text,
  start_date timestamptz, end_date timestamptz, is_active boolean default true, is_deleted boolean default false,
  deleted_at timestamptz, allowed_retake_student_ids text[] default '{}', target_type text, class_id text,
  student_ids text[] default '{}', questions jsonb default '[]', assignments jsonb default '[]',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.submissions (
  id text primary key, quiz_id text, student_id text, score numeric, total_possible_score numeric, percentage numeric,
  answers_json jsonb default '[]', completed_at timestamptz default now(), status text, time_spent_seconds integer,
  is_retake boolean default false, created_at timestamptz default now()
);

-- بيانات الاختبار المستخدمة في security-test.mjs
insert into users (id,name,role,national_id,password,class_id,teacher_permissions) values
 ('u-admin','مدير','admin','1010','admin123',null,'{}'),
 ('u-teach','معلم','teacher','2020','teach123',null,'{}'),
 ('u-sup','مشرف','supervisor','3030','sup12345',null,'{"can_view_activity_log":true}'),
 ('11111111-1111-1111-1111-111111111111','طالب أ','student','4040','itqan123','c1','{}'),
 ('u-st2','طالب ب','student','5050','stud123','c2','{}');
insert into classes values ('c1','أ','x',0,null),('c2','ب','x',0,null);
insert into quizzes (id,title,teacher_id,status,questions,assignments,allowed_retake_student_ids,duration_minutes) values
 ('qz1','اختبار أ','u-teach','published',
  '[{"id":"q1","type":"mcq","question_text":"1+1","options":["1","2","3","4"],"correct_option_index":1,"marks":2,"explanation":"secret"},
    {"id":"q2","type":"essay","question_text":"اكتب","marks":3},
    {"id":"q3","type":"passage","question_text":"قطعة","marks":5,"sub_questions":[
      {"id":"s1","type":"true_false","question_text":"tf","options":["صواب","خطأ"],"correct_option_index":0,"marks":2},
      {"id":"s2","type":"mcq","question_text":"m","options":["a","b","c","d"],"correct_option_index":3,"marks":3}]}]',
  '[{"target_type":"class","target_id":"c1"}]','{}',10),
 ('qz2','اختبار ب فقط','u-teach','published','[{"id":"q1","type":"mcq","question_text":"x","options":["a","b"],"correct_option_index":0,"marks":1}]',
  '[{"target_type":"class","target_id":"c2"}]','{}',10),
 ('qz3','مسودة','u-teach','draft','[]','[{"target_type":"all"}]','{}',10);
insert into submissions (id,quiz_id,student_id,score,total_possible_score,percentage) values ('sub-old','qz2','u-st2',1,1,100);
