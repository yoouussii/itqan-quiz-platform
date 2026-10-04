import React, { useMemo, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PageHeader, Card } from '../common/ui';
import { HomeworkDetailModal, StateChip, dueText, useStudentHomework } from '../common/Homework';
import { Homework, hwState } from '../../services/homeworkService';
import { t, uiDir } from '../../i18n';
import type { User } from '../../types';

type Tab = 'todo' | 'done' | 'all';

/** واجباتي (الطالب): المطلوب، المسلَّم، والكل */
export const HomeworkStudentPage: React.FC = () => {
  const { currentUser, users, subjects } = useApp();
  const me = ((users as User[]).find((u) => u.id === currentUser?.id) || currentUser) as User;
  const { rows, subs, loaded, setSub } = useStudentHomework(me);
  const [tab, setTab] = useState<Tab>('todo');
  const [open, setOpen] = useState<Homework | null>(null);
  const now = Date.now();
  const groups = useMemo(() => {
    const todo = rows.filter((h) => ['pending', 'overdue'].includes(hwState(h, subs[h.id], now)))
      .sort((a, b) => (a.due_at || '9').localeCompare(b.due_at || '9'));
    const done = rows.filter((h) => ['submitted', 'late', 'graded'].includes(hwState(h, subs[h.id], now)));
    return { todo, done, all: rows };
  }, [rows, subs, now]);
  const list = groups[tab];
  const TABS: { id: Tab; label: string }[] = [
    { id: 'todo', label: t('المطلوب ({n})', { n: groups.todo.length }) },
    { id: 'done', label: t('المسلَّم ({n})', { n: groups.done.length }) },
    { id: 'all', label: t('الكل ({n})', { n: groups.all.length }) },
  ];

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-5" dir={uiDir()}>
      <PageHeader title={t('واجباتي')} subtitle={t('واجبات فصلك ومرفقاتها، وسلّم حلك من هنا')} />
      <div className="flex gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/70 w-fit" role="tablist">
        {TABS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
            className={`h-9 px-4 rounded-xl text-sm font-semibold ${tab === x.id ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm' : 'text-slate-600 dark:text-slate-300'}`}>{x.label}</button>
        ))}
      </div>
      {!loaded ? null : !list.length ? (
        <Card className="p-10 text-center text-slate-500">
          <NotebookPen className="w-10 h-10 mx-auto mb-2 text-slate-300" />
          {tab === 'todo' ? t('لا توجد واجبات مطلوبة الآن') : t('لا توجد واجبات')}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((h) => {
            const st = hwState(h, subs[h.id], now);
            const sub = subs[h.id];
            return (
              <button key={h.id} type="button" onClick={() => setOpen(h)} data-testid="homework-item"
                className="text-start rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{subjects.find((s) => s.id === h.subject_id)?.name || t('عام')}</div>
                    <div className="font-bold text-slate-900 dark:text-white mt-0.5">{h.title}</div>
                  </div>
                  <StateChip state={st} />
                </div>
                {h.body && <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{h.body}</p>}
                <div className="text-[13px] text-slate-500 mt-3 flex flex-wrap gap-x-3">
                  <span>{dueText(h.due_at)}</span>
                  {sub?.score != null && <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums" dir="ltr">{sub.score}{h.max_score ? ` / ${h.max_score}` : ''}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {open && <HomeworkDetailModal hw={open} student={me} sub={subs[open.id] || null} canSubmit onClose={() => setOpen(null)} onSaved={setSub} />}
    </div>
  );
};
