import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Save,
  ArrowRight,
  Clock,
  Award,
  HelpCircle,
  FileText,
  CheckCircle,
  ArrowUp,
  ArrowDown,
  Copy,
} from 'lucide-react';
import { TargetType } from '../../types';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { RichTextEditor } from '../common/RichTextEditor';
import { toLocalInputValue, toInputValue, inputToIso, defaultEndInput } from '../../utils/quizWindow';
import { stripHtml } from '../common/RichText';
import { uiDir, optionLetters } from '../../i18n';

export type QuestionType = 'mcq' | 'true_false' | 'essay' | 'passage';

export interface SubQuestion {
  id?: string;
  question_text: string;
  type: 'mcq' | 'true_false' | 'essay';
  options: string[];
  correct_option_index: number;
  marks: number;
  explanation?: string;
}

export interface QuestionItem {
  id?: string;
  /** معرّف داخلي ثابت للعرض فقط (لا يُحفظ): يمنع اختلاط محررات النص عند الحذف أو الترتيب */
  uid?: string;
  type: QuestionType;
  question_text: string;
  options: string[];
  correct_option_index: number;
  marks: number;
  explanation: string;
  sub_questions?: SubQuestion[];
}

/** عدد الأسئلة بصيغة عربية صحيحة */
const questionsLabel = (n: number) => (n === 1 ? 'سؤال واحد' : n === 2 ? 'سؤالان' : n <= 10 ? `${n} أسئلة` : `${n} سؤالاً`);

const newUid = () => `u-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** سؤال جديد فارغ حسب النوع */
export function blankQuestion(type: QuestionType = 'mcq'): QuestionItem {
  const base = { uid: newUid(), question_text: '', explanation: '' };
  if (type === 'true_false') return { ...base, type, options: ['صح', 'خطأ'], correct_option_index: 0, marks: 1 };
  if (type === 'essay') return { ...base, type, options: [], correct_option_index: -1, marks: 2 };
  if (type === 'passage') {
    return {
      ...base, type, options: [], correct_option_index: 0, marks: 1,
      sub_questions: [{ id: `sub_${Date.now()}`, question_text: '', type: 'mcq', options: ['', '', '', ''], correct_option_index: 0, marks: 1, explanation: '' }],
    };
  }
  return { ...base, type: 'mcq', options: ['', '', '', ''], correct_option_index: 0, marks: 1 };
}

export const QUESTION_TYPES: Array<{ type: QuestionType; label: string; short: string }> = [
  { type: 'mcq', label: 'اختيار من متعدد', short: 'اختيار' },
  { type: 'true_false', label: 'صح أو خطأ', short: 'صح/خطأ' },
  { type: 'essay', label: 'سؤال مقالي', short: 'مقالي' },
  { type: 'passage', label: 'قطعة وأسئلة فرعية', short: 'قطعة' },
];

export const QuizEditor: React.FC = () => {
  const {
    currentUser,
    subjects,
    classes,
    users,
    quizzes,
    createNewQuiz,
    editingQuizId,
    setEditingQuizId,
    updateFullQuiz,
    setCurrentView,
    duplicateQuizId,
    setDuplicateQuizId,
  } = useApp();

  const isEditing = Boolean(editingQuizId);
  const students = users.filter((u) => u.role === 'student');

  const teacherClassIds =
    currentUser?.assigned_class_ids && currentUser.assigned_class_ids.length > 0
      ? currentUser.assigned_class_ids
      : currentUser?.class_id
      ? [currentUser.class_id]
      : [];

  // شعب المعلم المسندة. إن لم يصل منها شيء (حُذفت أو خارج فرعه) نعرض كل الشعب المتاحة له
  // بدل قائمة فارغة، والخادم يحصر ما يراه في فرعه أصلاً
  const assignedVisible = classes.filter((c) => teacherClassIds.includes(c.id));
  const availableClasses =
    currentUser?.role === 'admin' || assignedVisible.length === 0 ? classes : assignedVisible;

  const teacherSubIds =
    currentUser?.assigned_subject_ids && currentUser.assigned_subject_ids.length > 0
      ? currentUser.assigned_subject_ids
      : currentUser?.specialty_id
      ? [currentUser.specialty_id]
      : [];

  const availableSubjects =
    currentUser?.role === 'admin'
      ? subjects
      : teacherSubIds.length > 0
      ? subjects.filter((s) => teacherSubIds.includes(s.id))
      : subjects;

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subjectId, setSubjectId] = useState(
    teacherSubIds[0] || subjects[0]?.id || ''
  );
  const [durationMinutes, setDurationMinutes] = useState(25);
  const [passPercentage, setPassPercentage] = useState(60);
  const [startDate, setStartDate] = useState(() => toLocalInputValue(new Date()));
  const [endDate, setEndDate] = useState(() => defaultEndInput());
  const [isActive, setIsActive] = useState(true);

  // Target assignment
  const [targetType, setTargetType] = useState<TargetType>('class');
  const [targetClassIds, setTargetClassIds] = useState<string[]>([]);

  // الصفوف المحددة التي ما زالت متاحة لهذا المستخدم (غير المتاحة تُستبعد من العدّ ومن الحفظ)
  const validClassIds = targetClassIds.filter((id) => availableClasses.some((c) => c.id === id));
  const hiddenClassNames = targetClassIds
    .filter((id) => !availableClasses.some((c) => c.id === id))
    .map((id) => classes.find((c) => c.id === id)?.name || 'صف غير متاح');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Questions State
  const [questions, setQuestions] = useState<QuestionItem[]>(() => [blankQuestion('mcq')]);

  // ضمان أن المادة المختارة في الـ state موجودة فعلاً في القائمة المعروضة
  // (الحالة الابتدائية قد تكون فارغة لأن المواد تُحمَّل بعد أول رندر)
  const subjectIdsKey = availableSubjects.map((s) => s.id).join(',');
  useEffect(() => {
    if (availableSubjects.length === 0) return;
    const isValid = availableSubjects.some((s) => s.id === subjectId);
    if (!isValid) {
      setSubjectId(availableSubjects[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectIdsKey, subjectId]);

  // تعبئة النموذج من اختبار موجود (للتعديل أو لتكرار اختبار كنسخة جديدة)
  const applyQuizToForm = (quiz: any, asCopy: boolean) => {
    setTitle(asCopy ? `${quiz.title} (نسخة)` : quiz.title);
    setDescription(quiz.description || '');
    setSubjectId(quiz.subject_id || '');
    setDurationMinutes(quiz.duration_minutes);
    setPassPercentage(quiz.pass_percentage);
    if (asCopy) {
      setStartDate(toLocalInputValue(new Date()));
      setEndDate(defaultEndInput());
      setIsActive(true);
    } else {
      setStartDate(toInputValue(quiz.start_date, 'start'));
      setEndDate(toInputValue(quiz.end_date, 'end'));
      setIsActive(quiz.is_active ?? true);
    }

    const srcQuestions: any[] =
      quiz.questions && quiz.questions.length > 0
        ? quiz.questions
        : StorageService.getQuestionsByQuizId(quiz.id);
    if (srcQuestions.length > 0) {
      setQuestions(
        srcQuestions.map((q: any) => ({
          uid: newUid(),
          id: asCopy ? undefined : q.id,
          type: q.type || 'mcq',
          question_text: q.question_text,
          options: q.options ? [...q.options] : [],
          correct_option_index: q.correct_option_index ?? 0,
          marks: q.marks,
          explanation: q.explanation || '',
          sub_questions: q.sub_questions
            ? q.sub_questions.map((sq: any) => ({
                id: asCopy ? `sq-${Math.random().toString(36).slice(2, 8)}` : sq.id,
                question_text: sq.question_text || '',
                type: sq.type || 'mcq',
                options: sq.options ? [...sq.options] : ['', '', '', ''],
                correct_option_index: sq.correct_option_index ?? 0,
                marks: sq.marks || 1,
                explanation: sq.explanation || '',
              }))
            : [],
        }))
      );
    }

    const asgs: any[] = (quiz.assignments || []).filter((a: any) => a.target_type !== 'assigned_teacher');
    if (asgs.length > 0) {
      const first = asgs[0];
      // خيار «جميع الطلاب» أُلغي: الاختبار القديم الموجّه للجميع يُعرض كل الشعب المتاحة محددة
      if (first.target_type === 'all') {
        setTargetType('class');
        setTargetClassIds(availableClasses.map((c) => c.id));
        return;
      }
      setTargetType(first.target_type);
      if (first.target_type === 'class') {
        setTargetClassIds(
          Array.from(new Set(asgs.filter((a) => a.target_type === 'class' && a.target_id).map((a) => a.target_id as string)))
        );
      } else if (first.target_type === 'specific_students' && first.target_id) {
        setSelectedStudentIds(String(first.target_id).split(',').map((x) => x.trim()).filter(Boolean));
      }
    }
  };

  // معلم له صف واحد فقط: نحدده تلقائياً
  const classIdsKey = availableClasses.map((c) => c.id).join(',');
  useEffect(() => {
    if (availableClasses.length === 1 && targetClassIds.length === 0 && !editingQuizId && !duplicateQuizId) {
      setTargetClassIds([availableClasses[0].id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classIdsKey]);

  const loadedQuizIdRef = useRef<string | null>(null);
  const duplicateLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editingQuizId) {
      loadedQuizIdRef.current = null;
      return;
    }

    if (loadedQuizIdRef.current === editingQuizId) {
      return;
    }

    const quizToEdit =
      quizzes.find((q) => q.id === editingQuizId) ||
      StorageService.getQuizWithDetails(editingQuizId);

    if (quizToEdit) {
      loadedQuizIdRef.current = editingQuizId;
      applyQuizToForm(quizToEdit, false);
    }
  }, [editingQuizId, quizzes]);

  // تكرار اختبار: نملأ النموذج بنسخة قابلة للتعديل ثم تُحفظ كاختبار جديد
  useEffect(() => {
    if (!duplicateQuizId || editingQuizId) return;
    if (duplicateLoadedRef.current === duplicateQuizId) return;
    const src =
      quizzes.find((q) => q.id === duplicateQuizId) || StorageService.getQuizWithDetails(duplicateQuizId);
    if (!src) return;
    duplicateLoadedRef.current = duplicateQuizId;
    applyQuizToForm(src, true);
    setDuplicateQuizId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateQuizId, editingQuizId, quizzes]);

  const handleAddQuestion = (type: QuestionType = 'mcq') => {
    setQuestions([...questions, blankQuestion(type)]);
    // الانتقال للسؤال الجديد
    setTimeout(() => document.getElementById(`q-card-${questions.length}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  const handleMoveQuestion = (idx: number, d: -1 | 1) => {
    const j = idx + d;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[idx], next[j]] = [next[j], next[idx]];
    setQuestions(next);
  };

  const handleDuplicateQuestion = (idx: number) => {
    const src = questions[idx];
    const copy: QuestionItem = {
      ...src,
      id: undefined,
      uid: newUid(),
      options: [...src.options],
      sub_questions: src.sub_questions?.map((sq) => ({ ...sq, id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, options: [...sq.options] })),
    };
    setQuestions([...questions.slice(0, idx + 1), copy, ...questions.slice(idx + 1)]);
  };

  const handleAddOption = (qIdx: number) => {
    setQuestions(questions.map((q, i) => (i === qIdx && q.options.length < 6 ? { ...q, options: [...q.options, ''] } : q)));
  };

  const handleRemoveOption = (qIdx: number, optIdx: number) => {
    setQuestions(
      questions.map((q, i) => {
        if (i !== qIdx || q.options.length <= 2) return q;
        const options = q.options.filter((_, k) => k !== optIdx);
        const c = q.correct_option_index;
        return { ...q, options, correct_option_index: c === optIdx ? 0 : c > optIdx ? c - 1 : c };
      })
    );
  };

  const handleRemoveQuestion = (idx: number) => {
    if (questions.length <= 1) return;
    setQuestions(questions.filter((_, i) => i !== idx));
  };

  const handleQuestionTypeChange = (idx: number, type: QuestionType) => {
    const updated = [...questions];
    updated[idx].type = type;

    if (type === 'passage') {
      if (!updated[idx].sub_questions || updated[idx].sub_questions!.length === 0) {
        updated[idx].sub_questions = [
          {
            id: `sub_${Date.now()}_1`,
            question_text: '',
            type: 'mcq',
            options: ['', '', '', ''],
            correct_option_index: 0,
            marks: 1,
            explanation: '',
          },
        ];
      }
      updated[idx].marks = updated[idx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
    } else if (type === 'true_false') {
      updated[idx].options = ['صح', 'خطأ'];
      updated[idx].correct_option_index = 0;
    } else if (type === 'mcq') {
      if (updated[idx].options.length !== 4) {
        updated[idx].options = ['', '', '', ''];
      }
      updated[idx].correct_option_index = 0;
    } else if (type === 'essay') {
      updated[idx].options = [];
      updated[idx].correct_option_index = -1;
    }

    setQuestions(updated);
  };

  const handleQuestionTextChange = (idx: number, text: string) => {
    const updated = [...questions];
    updated[idx].question_text = text;
    setQuestions(updated);
  };

  const handleOptionChange = (qIdx: number, optIdx: number, val: string) => {
    const updated = [...questions];
    updated[qIdx].options[optIdx] = val;
    setQuestions(updated);
  };

  const handleCorrectOptionChange = (qIdx: number, optIdx: number) => {
    const updated = [...questions];
    updated[qIdx].correct_option_index = optIdx;
    setQuestions(updated);
  };

  const handleMarksChange = (qIdx: number, marks: number) => {
    const updated = [...questions];
    updated[qIdx].marks = Math.max(1, marks);
    setQuestions(updated);
  };

  const handleExplanationChange = (qIdx: number, text: string) => {
    const updated = [...questions];
    updated[qIdx].explanation = text;
    setQuestions(updated);
  };

  const handleAddSubQuestion = (qIdx: number) => {
    const updated = [...questions];
    const currentSubQs = updated[qIdx].sub_questions || [];
    const newSubQ: SubQuestion = {
      id: `sub_${Date.now()}`,
      question_text: '',
      type: 'mcq',
      options: ['', '', '', ''],
      correct_option_index: 0,
      marks: 1,
      explanation: '',
    };
    updated[qIdx].sub_questions = [...currentSubQs, newSubQ];
    updated[qIdx].marks = updated[qIdx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
    setQuestions(updated);
  };

  const handleRemoveSubQuestion = (qIdx: number, sqIdx: number) => {
    const updated = [...questions];
    const subQList = updated[qIdx].sub_questions || [];
    if (subQList.length <= 1) {
      alert('يجب أن تحتوي القطعة على سؤال فرعي واحد على الأقل');
      return;
    }
    updated[qIdx].sub_questions = subQList.filter((_, i) => i !== sqIdx);
    updated[qIdx].marks = updated[qIdx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
    setQuestions(updated);
  };

  const handleSubQuestionTextChange = (qIdx: number, sqIdx: number, text: string) => {
    const updated = [...questions];
    if (updated[qIdx].sub_questions?.[sqIdx]) {
      updated[qIdx].sub_questions![sqIdx].question_text = text;
      setQuestions(updated);
    }
  };

  const handleSubQuestionTypeChange = (qIdx: number, sqIdx: number, type: 'mcq' | 'true_false' | 'essay') => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.type = type;
      if (type === 'true_false') {
        subQ.options = ['صواب', 'خطأ'];
        subQ.correct_option_index = 0;
      } else if (type === 'mcq') {
        subQ.options = ['', '', '', ''];
        subQ.correct_option_index = 0;
      } else if (type === 'essay') {
        subQ.options = [];
        subQ.correct_option_index = -1;
      }
      setQuestions(updated);
    }
  };

  const handleSubOptionChange = (qIdx: number, sqIdx: number, optIdx: number, val: string) => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.options[optIdx] = val;
      setQuestions(updated);
    }
  };

  const handleSubCorrectOptionChange = (qIdx: number, sqIdx: number, optIdx: number) => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.correct_option_index = optIdx;
      setQuestions(updated);
    }
  };

  const handleSubMarksChange = (qIdx: number, sqIdx: number, marks: number) => {
    const updated = [...questions];
    const subQ = updated[qIdx].sub_questions?.[sqIdx];
    if (subQ) {
      subQ.marks = Math.max(1, marks);
      updated[qIdx].marks = updated[qIdx].sub_questions!.reduce((sum, sq) => sum + (sq.marks || 0), 0);
      setQuestions(updated);
    }
  };

  const toggleStudentSelection = (studentId: string) => {
    if (selectedStudentIds.includes(studentId)) {
      setSelectedStudentIds(selectedStudentIds.filter((id) => id !== studentId));
    } else {
      setSelectedStudentIds([...selectedStudentIds, studentId]);
    }
  };

  const totalCalculatedMarks = questions.reduce((sum, q) => {
    if (q.type === 'passage' && q.sub_questions && q.sub_questions.length > 0) {
      return sum + q.sub_questions.reduce((subSum, sq) => subSum + (Number(sq.marks) || 0), 0);
    }
    return sum + (Number(q.marks) || 0);
  }, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('يرجى إدخال عنوان للاختبار');
      return;
    }

    const focusQuestion = (i: number, msg: string) => {
      document.getElementById(`q-card-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => alert(msg), 300);
    };
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!stripHtml(q.question_text).trim()) {
        focusQuestion(i, `يرجى كتابة نص السؤال رقم ${i + 1}`);
        return;
      }
      if (q.type === 'mcq') {
        const emptyAt = q.options.findIndex((o) => !stripHtml(o).trim());
        if (emptyAt >= 0) {
          focusQuestion(i, `الخيار ${emptyAt + 1} في السؤال رقم ${i + 1} فارغ: اكتبه أو احذفه`);
          return;
        }
      }
      if (q.type === 'passage') {
        if (!q.sub_questions || q.sub_questions.length === 0) {
          alert(`يرجى إضافة سؤال فرعي واحد على الأقل للقطعة في السؤال رقم ${i + 1}`);
          return;
        }
        for (let j = 0; j < q.sub_questions.length; j++) {
          if (!stripHtml(q.sub_questions[j].question_text).trim()) {
            alert(`يرجى كتابة نص السؤال الفرعي رقم ${j + 1} للقطعة رقم ${i + 1}`);
            return;
          }
        }
      }
    }

    if (startDate && endDate && new Date(endDate).getTime() <= new Date(startDate).getTime()) {
      alert('وقت انتهاء الإتاحة يجب أن يكون بعد وقت البدء');
      return;
    }

    if (!subjectId) {
      alert('يرجى اختيار المادة');
      return;
    }

    if (!currentUser?.id) {
      alert('انتهت الجلسة، يرجى تسجيل الدخول من جديد');
      return;
    }

    if (targetType === 'specific_students' && selectedStudentIds.length === 0) {
      alert('يرجى تحديد طالب واحد على الأقل للاستهداف المخصص');
      return;
    }

    if (targetType === 'class' && validClassIds.length === 0) {
      alert('يرجى اختيار صف واحد على الأقل');
      return;
    }

    const formattedQuestions = questions.map(({ uid: _uid, ...q }) => {
      if (q.type === 'passage') {
        const passageMarks = (q.sub_questions || []).reduce((sum, sq) => sum + (Number(sq.marks) || 0), 0);
        return {
          ...q,
          marks: passageMarks,
          sub_questions: q.sub_questions || [],
        };
      }
      return q;
    });

    // صف أو أكثر: تعيين مستقل لكل صف (يظهر الاختبار لطلاب كل الصفوف المحددة)
    const assignments =
      targetType === 'class'
        ? validClassIds.map((id) => ({
            target_type: 'class' as const,
            target_id: id,
            target_name: classes.find((c) => c.id === id)?.name,
          }))
        : [
            {
              target_type: targetType,
              target_id: targetType === 'specific_students' ? selectedStudentIds.join(',') : null,
            },
          ];

    try {
      let outcome: { synced: boolean; error?: string; status?: string };

      if (isEditing && editingQuizId) {
        outcome = await updateFullQuiz(
          editingQuizId,
          {
            title: title.trim(),
            description: description.trim(),
            subject_id: subjectId,
            total_marks: totalCalculatedMarks,
            duration_minutes: Number(durationMinutes),
            pass_percentage: Number(passPercentage),
            start_date: inputToIso(startDate),
            end_date: inputToIso(endDate),
            is_active: isActive,
          },
          formattedQuestions as any,
          assignments as any
        );
        loadedQuizIdRef.current = null;
        setEditingQuizId(null);
      } else {
        // الحفظ هنا يذهب إلى Supabase أولاً عبر الـ context (مصدر البيانات الرئيسي)
        outcome = await createNewQuiz(
          {
            title: title.trim(),
            description: description.trim(),
            subject_id: subjectId,
            teacher_id: currentUser.id,
            total_marks: totalCalculatedMarks,
            duration_minutes: Number(durationMinutes),
            pass_percentage: Number(passPercentage),
            status: 'published',
            start_date: inputToIso(startDate),
            end_date: inputToIso(endDate),
            is_active: isActive,
          },
          formattedQuestions as any,
          assignments as any
        );
      }

      if (outcome.synced) {
        alert(
          outcome.status === 'pending_approval'
            ? 'تم حفظ الاختبار وإرساله للاعتماد. سيظهر للطلاب بعد موافقة المسؤول.'
            : 'تم حفظ ونشر الاختبار بنجاح!'
        );
      } else {
        alert(
          'تم حفظ الاختبار على جهازك، لكنه لم يصل إلى الخادم بعد، ولن يراه الآدمن أو الطلاب قبل ذلك.\n' +
            'سيُعاد الإرسال تلقائياً. السبب: ' +
            (outcome.error || 'غير معروف')
        );
      }
      setCurrentView('dashboard');
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء حفظ الاختبار: ' + (err.message || 'خطأ غير معروف'));
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6" dir={uiDir()}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <button
            type="button"
            onClick={() => {
              setEditingQuizId(null);
              setCurrentView('dashboard');
            }}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 mb-2 font-bold transition-colors"
          >
            <ArrowRight className="w-4 h-4 dir-icon" />
            <span>العودة إلى قائمة الاختبارات</span>
          </button>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white font-cairo">
            {isEditing ? 'تعديل الاختبار والأسئلة' : 'إنشاء اختبار وتقييم إلكتروني جديد'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isEditing
              ? 'قم بتحديث بيانات الاختبار، معايير التقييم، تفاصيل الأسئلة وصلاحيات التعيين'
              : 'حدد إعدادات الاختبار، صلاحيات الاستهداف الدقيقة، وأسئلة التقييم التفاعلية'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-end bg-indigo-50 dark:bg-indigo-950 px-4 py-2 rounded-2xl border border-indigo-100 dark:border-indigo-900">
            <span className="text-[11px] text-indigo-700 dark:text-indigo-300 block font-bold">
              الدرجة الإجمالية
            </span>
            <span className="text-xl font-black text-indigo-900 dark:text-indigo-200 font-cairo">
              {totalCalculatedMarks} درجات
            </span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Step 1: Basic Information */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              1
            </span>
            <h2 className="font-bold text-base text-slate-900 dark:text-white">البيانات العامة للاختبار</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                عنوان الاختبار الرئيسي *
              </label>
              <input
                type="text"
                required
                placeholder="مثال: الاختبار الفصلي الأول في الجبر والهندسة التحليلية"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                المادة / التخصص *
              </label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-4 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">...اختر المادة</option>
                {availableSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  مدة الاختبار (بالدقائق) *
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={5}
                    max={180}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="w-full ps-10 pe-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  نسبة النجاح (%) *
                </label>
                <div className="relative">
                  <Award className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min={40}
                    max={100}
                    value={passPercentage}
                    onChange={(e) => setPassPercentage(Number(e.target.value))}
                    className="w-full ps-10 pe-3 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  أقل نسبة يعتبر عندها الطالب ناجحاً.
                  {totalCalculatedMarks > 0 && passPercentage > 0 && (
                    <> مثال: الدرجة الكلية {totalCalculatedMarks}، فينجح من يحصل على {(() => { const n = Math.ceil((totalCalculatedMarks * passPercentage) / 100); return `${n} ${n >= 3 && n <= 10 ? 'درجات' : 'درجة'}`; })()} أو أكثر.</>
                  )}
                </p>
              </div>
            </div>

            <div className="md:col-span-2 p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/60 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                    جدولة إتاحة الاختبار وحالة التفعيل الفوري
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    حدد الفترة الزمنية التي يُسمح خلالها للطلاب بدخول الاختبار وإمكانية الإيقاف اليدوي
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsActive(!isActive)}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {isActive ? 'الاختبار مفعل ومتاح' : 'الاختبار موقوف ومغلق'}
                  </span>
                  <div
                    className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                      isActive ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                        isActive ? 'translate-x-[-18px]' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    بدء إتاحة الاختبار (التاريخ والوقت) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    انتهاء إتاحة الاختبار (التاريخ والوقت) *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                وصف موجز وتعليمات للطلاب
              </label>
              <textarea
                rows={2}
                placeholder="مثال: يغطي هذا الاختبار موضوعات الوحدة الأولى والثانية..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Step 2: Targeting */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
              2
            </span>
            <div>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">
                صلاحيات وتخصيص استهداف الاختبار (Targeting)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                حدد بدقة من يحق له أداء هذا الاختبار والظهور في لوحته المدرسية
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <label
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                targetType === 'class'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">صف / شعبة محددة</span>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'class'}
                  onChange={() => setTargetType('class')}
                  className="accent-indigo-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                يظهر حصراً لطلاب الشعبة المحددة فقط
              </p>
            </label>

            <label
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                targetType === 'specific_students'
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/60 ring-2 ring-indigo-500/20'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-xs text-slate-900 dark:text-white">طلاب محددون بالاسم</span>
                <input
                  type="radio"
                  name="targetType"
                  checked={targetType === 'specific_students'}
                  onChange={() => setTargetType('specific_students')}
                  className="accent-indigo-600"
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                استهداف فردي مخصص لحالات التقوية أو الموهوبين
              </p>
            </label>
          </div>

          {targetType === 'class' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between mb-2 gap-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  اختر الصف أو الصفوف المستهدفة ({validClassIds.length} محدد):
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setTargetClassIds(
                      validClassIds.length === availableClasses.length ? [] : availableClasses.map((c) => c.id)
                    )
                  }
                  className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {validClassIds.length === availableClasses.length && availableClasses.length > 0
                    ? 'إلغاء تحديد الكل'
                    : 'تحديد الكل'}
                </button>
              </div>
              {availableClasses.length === 0 && (
                <p className="text-[13px] leading-relaxed text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 rounded-xl p-3">
                  لا توجد شعب متاحة لك. إن كنت مسنداً لفرع، اطلب من مدير النظام ربط الشعب بفرعك من «المواد والشعب» ← تعديل الشعبة، أو إضافة شعب لك.
                </p>
              )}
              {hiddenClassNames.length > 0 && (
                <div className="mb-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                  هذا الاختبار موجَّه أيضاً لصفوف غير مسندة لك ({hiddenClassNames.join(' ، ')}) وسيتم استبعادها عند الحفظ.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {availableClasses.map((cls) => {
                  const checked = targetClassIds.includes(cls.id);
                  return (
                    <label
                      key={cls.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer text-xs select-none transition-all ${
                        checked
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/70 font-bold text-indigo-900 dark:text-indigo-200'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                      }`}
                    >
                      <span>
                        {cls.name} <span className="text-slate-400 font-normal">({cls.grade_level})</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setTargetClassIds(
                            checked ? targetClassIds.filter((id) => id !== cls.id) : [...targetClassIds, cls.id]
                          )
                        }
                        className="accent-indigo-600 w-4 h-4"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {targetType === 'specific_students' && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                اختر الطلاب المحددين ({selectedStudentIds.length} محددين):
              </label>
              <div className="max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 p-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
                {students.map((st) => (
                  <label
                    key={st.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(st.id)}
                      onChange={() => toggleStudentSelection(st.id)}
                      className="rounded accent-indigo-600"
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-200">{st.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Questions List */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-soft">
          <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                3
              </span>
              <h2 className="font-bold text-base text-slate-900 dark:text-white">الأسئلة والتمارين</h2>
            </div>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
              {questionsLabel(questions.length)} • {totalCalculatedMarks} درجة
            </span>
          </div>

          <div className="space-y-6">
            {questions.map((q, qIdx) => (
              <div
                key={q.uid || q.id || qIdx}
                id={`q-card-${qIdx}`}
                className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4 scroll-mt-24"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white text-xs font-black flex items-center justify-center">
                      {qIdx + 1}
                    </span>
                    {/* نوع السؤال: أزرار بدل القائمة */}
                    <div className="flex flex-wrap rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5" role="radiogroup" aria-label={`نوع السؤال ${qIdx + 1}`}>
                      {QUESTION_TYPES.map((t) => (
                        <button key={t.type} type="button" role="radio" aria-checked={q.type === t.type}
                          onClick={() => q.type !== t.type && handleQuestionTypeChange(qIdx, t.type)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                            q.type === t.type ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}>
                          <span className="hidden sm:inline">{t.label}</span>
                          <span className="sm:hidden">{t.short}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="flex items-center gap-1.5 me-2">
                      <span className="text-xs font-bold text-slate-500">الدرجة:</span>
                      <input
                        type="number"
                        min={1}
                        aria-label={`درجة السؤال ${qIdx + 1}`}
                        value={q.marks}
                        onChange={(e) => handleMarksChange(qIdx, Number(e.target.value))}
                        disabled={q.type === 'passage'}
                        title={q.type === 'passage' ? 'درجة القطعة = مجموع درجات أسئلتها الفرعية' : undefined}
                        className="w-14 px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center disabled:opacity-60"
                      />
                    </div>
                    <button type="button" aria-label="تحريك السؤال لأعلى" title="تحريك لأعلى" disabled={qIdx === 0}
                      onClick={() => handleMoveQuestion(qIdx, -1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30">
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="تحريك السؤال لأسفل" title="تحريك لأسفل" disabled={qIdx === questions.length - 1}
                      onClick={() => handleMoveQuestion(qIdx, 1)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30">
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    <button type="button" aria-label="تكرار السؤال" title="تكرار السؤال"
                      onClick={() => handleDuplicateQuestion(qIdx)}
                      className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700">
                      <Copy className="w-4 h-4" />
                    </button>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        aria-label="حذف السؤال"
                        title="حذف السؤال"
                        onClick={() => {
                          const empty = !stripHtml(q.question_text).trim();
                          if (empty || window.confirm(`حذف السؤال رقم ${qIdx + 1}؟`)) handleRemoveQuestion(qIdx);
                        }}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {q.type === 'passage' ? 'نص القطعة / القرائية:' : 'نص السؤال:'}
                  </label>
                  <RichTextEditor
                    value={q.question_text}
                    onChange={(html) => handleQuestionTextChange(qIdx, html)}
                    placeholder={q.type === 'passage' ? 'أدخل نص القطعة القراءية هنا...' : 'اكتب نص السؤال هنا...'}
                    minHeight={q.type === 'passage' ? 140 : 80}
                  />
                </div>

                {/* MCQ Options: اختيار الإجابة الصحيحة بزر واضح */}
                {q.type === 'mcq' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">الخيارات (اضغط «صحيحة» بجانب الإجابة الصحيحة):</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                      {q.options.map((opt, optIdx) => {
                        const correct = q.correct_option_index === optIdx;
                        return (
                          <div key={optIdx}
                            className={`flex items-start gap-2 p-2 rounded-xl border-2 transition-colors ${
                              correct ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30' : 'border-transparent'
                            }`}>
                            <span className={`mt-1.5 w-7 h-7 shrink-0 rounded-lg text-xs font-black flex items-center justify-center ${
                              correct ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}>
                              {optionLetters()[optIdx] || optIdx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <RichTextEditor
                                variant="compact"
                                value={opt}
                                onChange={(html) => handleOptionChange(qIdx, optIdx, html)}
                                placeholder={`الخيار ${optIdx + 1}`}
                              />
                            </div>
                            <div className="flex flex-col gap-1 mt-1">
                              <button type="button" role="radio" aria-checked={correct} aria-label={`الخيار ${optIdx + 1} هو الإجابة الصحيحة`}
                                onClick={() => handleCorrectOptionChange(qIdx, optIdx)}
                                className={`px-2 py-1 rounded-lg text-[10px] font-black whitespace-nowrap ${
                                  correct ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-100 hover:text-emerald-700'
                                }`}>
                                {correct ? '✓ صحيحة' : 'صحيحة'}
                              </button>
                              {q.options.length > 2 && (
                                <button type="button" aria-label={`حذف الخيار ${optIdx + 1}`} title="حذف الخيار"
                                  onClick={() => handleRemoveOption(qIdx, optIdx)}
                                  className="px-2 py-1 rounded-lg text-[10px] font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40">
                                  حذف
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {q.options.length < 6 && (
                      <button type="button" onClick={() => handleAddOption(qIdx)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                        <Plus className="w-3.5 h-3.5" /> إضافة خيار
                      </button>
                    )}
                  </div>
                )}

                {/* True/False: زران كبيران */}
                {q.type === 'true_false' && (
                  <div className="pt-1">
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2">الإجابة الصحيحة:</p>
                    <div className="grid grid-cols-2 gap-3 max-w-sm">
                      {['صح', 'خطأ'].map((opt, optIdx) => {
                        const correct = q.correct_option_index === optIdx;
                        return (
                          <button key={optIdx} type="button" role="radio" aria-checked={correct}
                            onClick={() => handleCorrectOptionChange(qIdx, optIdx)}
                            className={`py-2.5 rounded-xl border-2 text-sm font-black transition-colors ${
                              correct
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                            }`}>
                            {correct ? `✓ ${opt}` : opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Essay Note */}
                {q.type === 'essay' && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl border border-amber-200 dark:border-amber-900">
                    * ملاحظة: الأسئلة المقالية تتطلب تصحيحاً يدويًا من قبل المعلم بعد تسليم الطالب.
                  </p>
                )}

                {/* Passage Sub-Questions */}
                {q.type === 'passage' && (
                  <div className="mt-4 space-y-4 border-t border-slate-200 dark:border-slate-700 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">الأسئلة الفرعية للقطعة:</h4>
                      <button
                        type="button"
                        onClick={() => handleAddSubQuestion(qIdx)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> إضافة سؤال فرعي
                      </button>
                    </div>

                    {(q.sub_questions || []).map((sq, sqIdx) => (
                      <div key={sqIdx} className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-500">سؤال فرعي {sqIdx + 1}</span>
                          <div className="flex items-center gap-2">
                            <select
                              value={sq.type}
                              onChange={(e) => handleSubQuestionTypeChange(qIdx, sqIdx, e.target.value as any)}
                              className="px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700"
                            >
                              <option value="mcq">اختيار من متعدد</option>
                              <option value="true_false">صح أو خطأ</option>
                              <option value="essay">مقالي</option>
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={sq.marks}
                              onChange={(e) => handleSubMarksChange(qIdx, sqIdx, Number(e.target.value))}
                              className="w-14 px-2 py-1 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveSubQuestion(qIdx, sqIdx)}
                              className="text-rose-500 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        <RichTextEditor
                          variant="compact"
                          value={sq.question_text}
                          onChange={(html) => handleSubQuestionTextChange(qIdx, sqIdx, html)}
                          placeholder="نص السؤال الفرعي..."
                          minHeight={50}
                        />

                        {sq.type === 'mcq' && (
                          <div className="grid grid-cols-2 gap-2">
                            {sq.options.map((opt, optIdx) => (
                              <div key={optIdx} className="flex items-center gap-1.5">
                                <input
                                  type="radio"
                                  name={`sub_correct_${qIdx}_${sqIdx}`}
                                  checked={sq.correct_option_index === optIdx}
                                  onChange={() => handleSubCorrectOptionChange(qIdx, sqIdx, optIdx)}
                                  className="accent-indigo-600"
                                />
                                <div className="flex-1 min-w-0">
                                  <RichTextEditor
                                    variant="compact"
                                    value={opt}
                                    onChange={(html) => handleSubOptionChange(qIdx, sqIdx, optIdx, html)}
                                    placeholder={`خيار ${optIdx + 1}`}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Explanation */}
                <div>
                  <RichTextEditor
                    variant="compact"
                    value={q.explanation}
                    onChange={(html) => handleExplanationChange(qIdx, html)}
                    placeholder="شرح الإجابة النموذجية (اختياري يظهر للطلاب بعد التقييم)..."
                    minHeight={50}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* إضافة سؤال حسب النوع */}
          <div className="mt-6 p-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-center gap-2">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 me-1">
              <Plus className="w-4 h-4 inline -mt-0.5" /> أضف سؤالاً:
            </span>
            {QUESTION_TYPES.map((t) => (
              <button key={t.type} type="button" onClick={() => handleAddQuestion(t.type)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Footer Actions: شريط ثابت أسفل الشاشة */}
        <div className="sticky bottom-0 z-30 -mx-4 sm:mx-0 px-4 sm:px-5 py-3 sm:rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t sm:border border-slate-200 dark:border-slate-800 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)] flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
            {questionsLabel(questions.length)} •
            <span className="text-indigo-700 dark:text-indigo-300"> الدرجة الكلية {totalCalculatedMarks}</span>
          </div>
          <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setEditingQuizId(null);
              setCurrentView('dashboard');
            }}
            className="px-6 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            إلغاء
          </button>
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Save className="w-4 h-4" />
            <span>{isEditing ? 'تحديث وتعديل الاختبار' : 'حفظ ونشر الاختبار'}</span>
          </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default QuizEditor;
