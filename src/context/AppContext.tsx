import React, { createContext, useContext, useState, useEffect } from 'react';
import { Quiz, Question, User, Subject, Class, Submission } from '../types';

interface AppContextType {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  quizzes: Quiz[];
  setQuizzes: React.Dispatch<React.SetStateAction<Quiz[]>>;
  submissions: Submission[];
  setSubmissions: React.Dispatch<React.SetStateAction<Submission[]>>;
  subjects: Subject[];
  classes: Class[];
  users: User[];
  currentView: string;
  setCurrentView: (view: string) => void;
  editingQuizId: string | null;
  setEditingQuizId: (id: string | null) => void;
  createNewQuiz: (quizData: Partial<Quiz>, questions: Question[], assignments: any[]) => Promise<void>;
  updateFullQuiz: (id: string, quizData: Partial<Quiz>, questions: Question[], assignments: any[]) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [editingQuizId, setEditingQuizId] = useState<string | null>(null);

  const createNewQuiz = async (quizData: Partial<Quiz>, questions: Question[], assignments: any[]) => {
    const newQuiz: Quiz = {
      id: `quiz_${Date.now()}`,
      title: quizData.title || '',
      description: quizData.description || '',
      subject_id: quizData.subject_id || '',
      teacher_id: quizData.teacher_id || '',
      total_marks: quizData.total_marks || 100,
      duration_minutes: quizData.duration_minutes || 30,
      pass_percentage: quizData.pass_percentage || 50,
      is_active: quizData.is_active ?? true,
      questions: questions,
      assignments: assignments,
      created_at: new Date().toISOString(),
      ...quizData,
    } as Quiz;

    setQuizzes((prev) => [...prev, newQuiz]);
  };

  const updateFullQuiz = async (id: string, quizData: Partial<Quiz>, questions: Question[], assignments: any[]) => {
    setQuizzes((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              ...quizData,
              questions,
              assignments,
            }
          : q
      )
    );
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        quizzes,
        setQuizzes,
        submissions,
        setSubmissions,
        subjects,
        classes,
        users,
        currentView,
        setCurrentView,
        editingQuizId,
        setEditingQuizId,
        createNewQuiz,
        updateFullQuiz,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
