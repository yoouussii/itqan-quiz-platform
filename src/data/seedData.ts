import { User, Subject, SchoolClass, Quiz, Question, QuizAssignment, Submission } from '../types';

export const initialUsers: User[] = [
  // Super Admin
  {
    id: 'usr-admin-1',
    national_id: '1010203040',
    name: 'د. عبدالرحمن المنصور',
    email: 'admin@itqan.edu.sa',
    password: 'admin123',
    role: 'admin',
    created_at: '2026-09-01T08:00:00Z',
  },
  // Teachers
  {
    id: 'usr-teacher-1',
    national_id: '1020304051',
    name: 'أ. أحمد الفهد',
    email: 'ahmed@itqan.edu.sa',
    password: 'teach123',
    role: 'teacher',
    specialty_id: 'subj-math',
    assigned_subject_ids: ['subj-math', 'subj-tech'],
    teacher_permissions: {
      can_add_custom_subjects: true,
      can_manage_classes: true,
      can_view_all_reports: true,
    },
    created_at: '2026-09-02T08:00:00Z',
  },
  {
    id: 'usr-teacher-2',
    national_id: '1020304052',
    name: 'أ. سارة القحطاني',
    email: 'sara@itqan.edu.sa',
    password: 'teach123',
    role: 'teacher',
    specialty_id: 'subj-science',
    assigned_subject_ids: ['subj-science'],
    teacher_permissions: {
      can_add_custom_subjects: false,
      can_manage_classes: false,
      can_view_all_reports: false,
    },
    created_at: '2026-09-02T09:00:00Z',
  },
  {
    id: 'usr-teacher-3',
    national_id: '1020304053',
    name: 'أ. خالد الشمري',
    email: 'khaled@itqan.edu.sa',
    password: 'teach123',
    role: 'teacher',
    specialty_id: 'subj-arabic',
    assigned_subject_ids: ['subj-arabic', 'subj-islamic'],
    teacher_permissions: {
      can_add_custom_subjects: true,
      can_manage_classes: false,
      can_view_all_reports: false,
    },
    created_at: '2026-09-03T08:30:00Z',
  },
  // Students (Class 1)
  {
    id: 'usr-student-1',
    national_id: '1030405001',
    name: 'عمر الفاروق الزهراني',
    email: 'omar@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-1',
    created_at: '2026-09-05T10:00:00Z',
  },
  {
    id: 'usr-student-2',
    national_id: '1030405002',
    name: 'ليلى الهاشمي',
    email: 'layla@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-1',
    created_at: '2026-09-05T10:05:00Z',
  },
  {
    id: 'usr-student-3',
    national_id: '1030405003',
    name: 'زياد الحربي',
    email: 'zyad@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-1',
    created_at: '2026-09-05T10:10:00Z',
  },
  {
    id: 'usr-student-4',
    national_id: '1030405004',
    name: 'نورة التميمي',
    email: 'noura@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-1',
    created_at: '2026-09-05T10:15:00Z',
  },
  // Students (Class 2)
  {
    id: 'usr-student-5',
    national_id: '1030405005',
    name: 'ريان الدوسري',
    email: 'rayan@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-2',
    created_at: '2026-09-05T10:20:00Z',
  },
  {
    id: 'usr-student-6',
    national_id: '1030405006',
    name: 'مريم الغامدي',
    email: 'mariam@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-2',
    created_at: '2026-09-05T10:25:00Z',
  },
  {
    id: 'usr-student-7',
    national_id: '1030405007',
    name: 'فهد السبيعي',
    email: 'fahad@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-2',
    created_at: '2026-09-05T10:30:00Z',
  },
  {
    id: 'usr-student-8',
    national_id: '1030405008',
    name: 'سارة العلي',
    email: 'sarah.ali@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-2',
    created_at: '2026-09-05T10:35:00Z',
  },
  // Students (Class 3)
  {
    id: 'usr-student-9',
    national_id: '1030405009',
    name: 'جنى العتيبي',
    email: 'jana@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-3',
    created_at: '2026-09-05T10:40:00Z',
  },
  {
    id: 'usr-student-10',
    national_id: '1030405010',
    name: 'سلطان المطيري',
    email: 'sultan@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-3',
    created_at: '2026-09-05T10:45:00Z',
  },
  {
    id: 'usr-student-11',
    national_id: '1030405011',
    name: 'عبدالله الشهري',
    email: 'abdullah@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-3',
    created_at: '2026-09-05T10:50:00Z',
  },
  {
    id: 'usr-student-12',
    national_id: '1030405012',
    name: 'شهد القحطاني',
    email: 'shahad@student.edu.sa',
    password: 'stud123',
    role: 'student',
    class_id: 'cls-3',
    created_at: '2026-09-05T10:55:00Z',
  }
];

export const initialSubjects: Subject[] = [
  {
    id: 'subj-math',
    name: 'الرياضيات',
    code: 'MATH101',
    description: 'الجبر، الهندسة التحليلية، حساب التفاضل والتكامل، والإحصاء الرياضي',
    icon: 'Calculator',
    color: '#4f46e5',
  },
  {
    id: 'subj-science',
    name: 'العلوم والفيزياء',
    code: 'SCI201',
    description: 'الميكانيكا الكلاسيكية، الكهرباء والمغناطيسية، والتركيب الذري والكيميائي',
    icon: 'Atom',
    color: '#059669',
  },
  {
    id: 'subj-arabic',
    name: 'اللغة العربية',
    code: 'ARB101',
    description: 'قواعد النحو والصرف، البلاغة والأدب العربي، وفنون التعبير الإنشائي',
    icon: 'BookOpen',
    color: '#d97706',
  },
  {
    id: 'subj-tech',
    name: 'التقنية الرقمية والذكاء الاصطناعي',
    code: 'TECH301',
    description: 'الخوارزميات، لغات البرمجة، هياكل البيانات ومفاهيم التعلم الآلي',
    icon: 'Cpu',
    color: '#0891b2',
  },
  {
    id: 'subj-islamic',
    name: 'الدراسات الإسلامية',
    code: 'ISL101',
    description: 'علوم القرآن الكريم والتفسير، الفقه الإسلامي، والحديث النبوي الشريف',
    icon: 'Compass',
    color: '#7c3aed',
  },
];

export const initialClasses: SchoolClass[] = [
  {
    id: 'cls-1',
    name: 'الصف الأول الثانوي - شعبة (أ)',
    grade_level: 'المرحلة الثانوية - الصف الأول',
    student_count: 4,
  },
  {
    id: 'cls-2',
    name: 'الصف الأول الثانوي - شعبة (ب)',
    grade_level: 'المرحلة الثانوية - الصف الأول',
    student_count: 4,
  },
  {
    id: 'cls-3',
    name: 'الصف الثاني الثانوي - مسار علمي',
    grade_level: 'المرحلة الثانوية - الصف الثاني',
    student_count: 4,
  },
];

export const initialQuizzes: Quiz[] = [
  {
    id: 'quiz-math-1',
    title: 'اختبار الجبر والدوال والكسور الجزئية',
    description: 'تقييم شامل في حل المعادلات التربيعية وتحديد مجال ومدى الدوال الجبرية وتطبيقاتها الحياتية.',
    subject_id: 'subj-math',
    teacher_id: 'usr-teacher-1',
    total_marks: 20,
    duration_minutes: 25,
    pass_percentage: 60,
    status: 'published',
    created_at: '2026-09-20T09:00:00Z',
    start_date: '2026-09-20',
    end_date: '2026-10-30',
    is_active: true,
    is_deleted: false,
    deleted_at: null,
    allowed_retake_student_ids: ['usr-student-2'], // Pre-allowed retake for student 2 to showcase
  },
  {
    id: 'quiz-science-1',
    title: 'التقييم الدوري: قوانين نيوتن وتطبيقات القوة والحركة',
    description: 'اختبار تجريبي يغطي مبادئ القصور الذاتي، القوة والتسارع، وقانون الفعل ورد الفعل مع مسائل فيزيائية واقعية.',
    subject_id: 'subj-science',
    teacher_id: 'usr-teacher-2',
    total_marks: 20,
    duration_minutes: 20,
    pass_percentage: 60,
    status: 'published',
    created_at: '2026-09-22T10:30:00Z',
    start_date: '2026-09-22',
    end_date: '2026-10-25',
    is_active: true,
    is_deleted: false,
    deleted_at: null,
    allowed_retake_student_ids: [],
  },
  {
    id: 'quiz-arabic-1',
    title: 'اختبار النحو والبلاغة: المفاعيل وعلم البيان',
    description: 'فحص مهارات الإعراب المتقدم، التمييز بين المفعول المطلق ولأجله، ومواطن التشبيه والاستعارة.',
    subject_id: 'subj-arabic',
    teacher_id: 'usr-teacher-3',
    total_marks: 20,
    duration_minutes: 30,
    pass_percentage: 65,
    status: 'published',
    created_at: '2026-09-23T11:00:00Z',
    start_date: '2026-09-23',
    end_date: '2026-10-28',
    is_active: true,
    is_deleted: false,
    deleted_at: null,
    allowed_retake_student_ids: [],
  },
  {
    id: 'quiz-tech-1',
    title: 'أساسيات التقنية الرقمية والخوارزميات البرمجية',
    description: 'مفاهيم التفكير الحسابي، التعقيد الزمني، ومبادئ حماية البيانات والأمن السيبراني.',
    subject_id: 'subj-tech',
    teacher_id: 'usr-teacher-1',
    total_marks: 20,
    duration_minutes: 15,
    pass_percentage: 60,
    status: 'published',
    created_at: '2026-09-25T13:00:00Z',
    start_date: '2026-09-25',
    end_date: '2026-10-31',
    is_active: true,
    is_deleted: false,
    deleted_at: null,
    allowed_retake_student_ids: [],
  },
  {
    id: 'quiz-deleted-demo',
    title: 'اختبار تشخيصي تمهيدي مبكر (محذوف)',
    description: 'اختبار تشخيصي تم حذفه من قِبل إدارة المادة لأغراض التطوير وتعديل الخطة الدراسية.',
    subject_id: 'subj-math',
    teacher_id: 'usr-teacher-1',
    total_marks: 20,
    duration_minutes: 15,
    pass_percentage: 60,
    status: 'archived',
    created_at: '2026-09-10T08:00:00Z',
    start_date: '2026-09-10',
    end_date: '2026-09-15',
    is_active: false,
    is_deleted: true,
    deleted_at: '2026-09-18T14:20:00Z',
    allowed_retake_student_ids: [],
  },
];

export const initialQuestions: Question[] = [
  // Math Quiz Questions (4 questions x 5 marks = 20)
  {
    id: 'q-math-1',
    quiz_id: 'quiz-math-1',
    question_text: 'ما هو حل المعادلة التربيعية: س² - 5س + 6 = 0؟',
    options: [
      'س = 2 ، س = 3',
      'س = -2 ، س = -3',
      'س = 1 ، س = 6',
      'س = -1 ، س = -6'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'بتحليل المقدار الثلاثي إلى قوسين: (س - 2)(س - 3) = 0، بالتالي فإن س = 2 أو س = 3.'
  },
  {
    id: 'q-math-2',
    quiz_id: 'quiz-math-1',
    question_text: 'ما هو مجال الدالة الكسرية: د(س) = (س + 3) / (س - 4)؟',
    options: [
      'مجموعة الأعداد الحقيقية ح ما عدا { -3 }',
      'مجموعة الأعداد الحقيقية ح ما عدا { 4 }',
      'مجموعة الأعداد الحقيقية الموجبة فقط',
      'جميع الأعداد الحقيقية ح بلا استثناء'
    ],
    correct_option_index: 1,
    marks: 5,
    explanation: 'مجال الدالة الكسرية هو جميع الأعداد الحقيقية ح باستثناء القيم التي تجعل المقام مساوياً للصفر، وحيث إن س - 4 = 0 تعني س = 4، فالمجال هو ح \\ {4}.'
  },
  {
    id: 'q-math-3',
    quiz_id: 'quiz-math-1',
    question_text: 'إذا كان ميل المستقيم المار بالنقطتين (1، 2) و (3، ص) يساوي 2، فما قيمة ص؟',
    options: [
      'ص = 4',
      'ص = 6',
      'ص = 8',
      'ص = 5'
    ],
    correct_option_index: 1,
    marks: 5,
    explanation: 'قانون الميل م = (ص2 - ص1) / (س2 - س1) => 2 = (ص - 2) / (3 - 1) => 2 = (ص - 2) / 2 => 4 = ص - 2 => ص = 6.'
  },
  {
    id: 'q-math-4',
    quiz_id: 'quiz-math-1',
    question_text: 'ما هو رأس القطع المكافئ الممثل بالدالة: ص = (س - 3)² + 5؟',
    options: [
      '(3، 5)',
      '(-3، 5)',
      '(3، -5)',
      '(5، 3)'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'في الصورة القياسية ص = أ(س - د)² + هـ، يكون رأس القطع عند النقطة (د، هـ) أي (3، 5).'
  },

  // Science Quiz Questions
  {
    id: 'q-sci-1',
    quiz_id: 'quiz-science-1',
    question_text: 'ينص قانون نيوتن الثاني على أن تسارع الجسم يتناسب طردياً مع القوة المحصلة المؤثرة وعكسياً مع:',
    options: [
      'كتلة الجسم',
      'سرعة الجسم اللحظية',
      'كثافة المادة',
      'حجم الجسم'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'وفقاً للعلاقة ق = ك × ت، فإن التسارع ت = ق / ك، مما يوضح تناسبه العكسي مع كتلة الجسم (ك).'
  },
  {
    id: 'q-sci-2',
    quiz_id: 'quiz-science-1',
    question_text: 'سيارة كتلتها 1000 كجم تتحرك بسرعة ثابتة مقدارها 20 م/ث، ما هي طاقتها الحركية (Kinetic Energy)؟',
    options: [
      '200,000 جول',
      '10,000 جول',
      '400,000 جول',
      '20,000 جول'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'طاقة الحركة ط ح = 0.5 × ك × ع² = 0.5 × 1000 × (20)² = 500 × 400 = 200,000 جول.'
  },
  {
    id: 'q-sci-3',
    quiz_id: 'quiz-science-1',
    question_text: 'عند إطلاق رصاصة من بندقية، ترتد البندقية إلى الخلف. هذه الظاهرة تعد مثالاً مباشراً على:',
    options: [
      'قانون نيوتن الأول (القصور الذاتي)',
      'قانون نيوتن الثالث (لكل فعل رد فعل مساوٍ له في المقدار ومعاكس له في الاتجاه)',
      'قانون كبلر الأول لحركة الكواكب',
      'مبدأ باسكال لضغط السوائل'
    ],
    correct_option_index: 1,
    marks: 5,
    explanation: 'قوة دفع الرصاصة للأمام تمثل قوة الفعل، وقوة ارتداد البندقية للخلف تمثل رد الفعل المساوي لها مقداراً والمضاد اتجاهاً.'
  },
  {
    id: 'q-sci-4',
    quiz_id: 'quiz-science-1',
    question_text: 'وحدة قياس الشغل والقدرة في النظام الدولي للوحدات (SI) على التوالي هي:',
    options: [
      'الجول والواط',
      'النيوتن والباسكال',
      'الكلفن والأمبير',
      'الواط والجول'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'يقاس الشغل بالجول (Joule) بينما تقاس القدرة - وهي معدل بذل الشغل - بالواط (Watt).'
  },

  // Arabic Quiz Questions
  {
    id: 'q-arb-1',
    quiz_id: 'quiz-arabic-1',
    question_text: 'في جملة «وقفَ الطلابُ إجلالاً للمعلمِ»، ما إعراب كلمة «إجلالاً»؟',
    options: [
      'مفعول لأجله منصوب وعلامة نصبه الفتحة',
      'مفعول مطلق منصوب وعلامة نصبه الفتحة',
      'حال منصوبة وعلامة نصبها الفتحة',
      'تمييز منصوب وعلامة نصبه الفتحة'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: '«إجلالاً» مصدر قلبي يبين سبب حدوث الفعل (لماذا وقف الطلاب؟ إجلالاً للمعلم)، ولذلك يعرب مفعولاً لأجله.'
  },
  {
    id: 'q-arb-2',
    quiz_id: 'quiz-arabic-1',
    question_text: 'حدد نوع التشبيه في قول الشاعر: «أنتَ كالشمسِ في الضياءِ»:',
    options: [
      'تشبيه مفرد تام الأركان (مرسل مفصل)',
      'تشبيه بليغ',
      'تشبيه مؤكد مجمل',
      'تشبيه تمثيلي'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'اشتمل التشبيه على المشبه (أنت)، المشبه به (الشمس)، أداة التشبيه (الكاف)، ووجه الشبه (في الضياء)، فهو تام ومفصل.'
  },
  {
    id: 'q-arb-3',
    quiz_id: 'quiz-arabic-1',
    question_text: 'أي من الكلمات التالية تعتبر ممنوعة من الصرف لعلتين (العلمية وزيادة الألف والنون)؟',
    options: [
      'عثمان',
      'مساجد',
      'صحراء',
      'أفضل'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: '«عثمان» علم ينتهي بألف ونون زائدتين. أما مساجد فصيغة منتهى الجموع (علة واحدة)، وصحراء اسم مختوم بألف التأنيث الممدودة، وأفضل صفة على وزن أفعل.'
  },
  {
    id: 'q-arb-4',
    quiz_id: 'quiz-arabic-1',
    question_text: 'ما هو علامة رفع الأفعال الخمسة في اللغة العربية؟',
    options: [
      'ثبوت النون',
      'الضمة الظاهرة',
      'حذف النون',
      'الواو'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'ترفع الأفعال الخمسة بثبوت النون في آخرها، وتجزم وتنصب بحذفها.'
  },

  // Tech Quiz Questions
  {
    id: 'q-tech-1',
    quiz_id: 'quiz-tech-1',
    question_text: 'ما هو المصطلح البرمجي الذي يشير إلى هيكل بياني يتبع مبدأ (FIFO - First In First Out)؟',
    options: [
      'الطابور (Queue)',
      'المكدس (Stack)',
      'الشجرة الثنائية (Binary Tree)',
      'المصفوفة الترابطية (Hash Map)'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'الطابور (Queue) يعتمد مبدأ من يدخل أولاً يخرج أولاً (FIFO)، بعكس المكدس (Stack) الذي يعتمد (LIFO).'
  },
  {
    id: 'q-tech-2',
    quiz_id: 'quiz-tech-1',
    question_text: 'أي نوع من أنواع التعلم الآلي يعتمد على وجود مدخلات موسومة ومصنفة مسبقاً (Labeled Data)؟',
    options: [
      'التعلم الإشرافي (Supervised Learning)',
      'التعلم غير الإشرافي (Unsupervised Learning)',
      'التعلم المعزز (Reinforcement Learning)',
      'التعلم شبه المعزز (Heuristic Learning)'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'في التعلم الخاضع للإشراف (Supervised Learning)، يتم تدريب النموذج على أزواج من المدخلات والمخرجات الصحيحة المصنفة مسبقاً.'
  },
  {
    id: 'q-tech-3',
    quiz_id: 'quiz-tech-1',
    question_text: 'ما هو التعقيد الزمني (Time Complexity) لعملية البحث الثنائي (Binary Search) في مصفوفة مرتبة؟',
    options: [
      'O(log n)',
      'O(n)',
      'O(n²)',
      'O(1)'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'البحث الثنائي يقسم حجم المشكلة إلى النصف في كل خطوة، لذلك تعقيده الزمني هو O(log n).'
  },
  {
    id: 'q-tech-4',
    quiz_id: 'quiz-tech-1',
    question_text: 'أي من التالي يعد أفضل ممارسة لتأمين كلمات مرور المستخدمين في قواعد البيانات؟',
    options: [
      'التشفير الأحادي الاتجاه باستخدام الهاشينغ مع ملح أمني (Hashing with Salt)',
      'تخزينها كنصوص صريحة (Plain text)',
      'تشفيرها باستخدام Base64 البسيط',
      'حفظها في ملف نصي محمي بكلمة سر'
    ],
    correct_option_index: 0,
    marks: 5,
    explanation: 'خوارزميات الهاش المؤمنة مع Salt فريد تمنع استرجاع كلمة المرور حتى في حال تسرب قاعدة البيانات.'
  }
];

export const initialAssignments: QuizAssignment[] = [
  {
    id: 'asg-1',
    quiz_id: 'quiz-math-1',
    target_type: 'class',
    target_id: 'cls-1',
    target_name: 'الصف الأول الثانوي - شعبة (أ)',
    assigned_by_teacher_id: 'usr-teacher-1',
    created_at: '2026-09-20T09:30:00Z',
  },
  {
    id: 'asg-2',
    quiz_id: 'quiz-science-1',
    target_type: 'all',
    target_id: null,
    target_name: 'جميع طلاب المدرسة (شامل)',
    assigned_by_teacher_id: 'usr-teacher-2',
    created_at: '2026-09-22T11:00:00Z',
  },
  {
    id: 'asg-3',
    quiz_id: 'quiz-arabic-1',
    target_type: 'specific_students',
    target_id: 'usr-student-1,usr-student-2,usr-student-5,usr-student-9',
    target_name: '4 طلاب متميزين محددين بالاسم',
    assigned_by_teacher_id: 'usr-teacher-3',
    created_at: '2026-09-23T11:30:00Z',
  },
  {
    id: 'asg-4',
    quiz_id: 'quiz-tech-1',
    target_type: 'class',
    target_id: 'cls-3',
    target_name: 'الصف الثاني الثانوي - مسار علمي',
    assigned_by_teacher_id: 'usr-teacher-1',
    created_at: '2026-09-25T13:30:00Z',
  },
];

export const initialSubmissions: Submission[] = [
  {
    id: 'sub-1',
    quiz_id: 'quiz-math-1',
    student_id: 'usr-student-1',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-26T14:30:00Z',
    time_spent_seconds: 780,
    answers_json: [
      { question_id: 'q-math-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-2', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-3', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-2',
    quiz_id: 'quiz-math-1',
    student_id: 'usr-student-2',
    score: 15,
    total_possible_score: 20,
    percentage: 75,
    status: 'completed',
    completed_at: '2026-09-26T15:10:00Z',
    time_spent_seconds: 920,
    answers_json: [
      { question_id: 'q-math-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-2', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-3', selected_option: 0, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-math-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-3',
    quiz_id: 'quiz-math-1',
    student_id: 'usr-student-3',
    score: 10,
    total_possible_score: 20,
    percentage: 50,
    status: 'completed',
    completed_at: '2026-09-27T10:00:00Z',
    time_spent_seconds: 1100,
    answers_json: [
      { question_id: 'q-math-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-2', selected_option: 0, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-math-3', selected_option: 2, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-math-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-4',
    quiz_id: 'quiz-math-1',
    student_id: 'usr-student-4',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-27T11:45:00Z',
    time_spent_seconds: 640,
    answers_json: [
      { question_id: 'q-math-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-2', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-3', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-5',
    quiz_id: 'quiz-science-1',
    student_id: 'usr-student-1',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-28T09:20:00Z',
    time_spent_seconds: 520,
    answers_json: [
      { question_id: 'q-sci-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-3', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-6',
    quiz_id: 'quiz-science-1',
    student_id: 'usr-student-5',
    score: 15,
    total_possible_score: 20,
    percentage: 75,
    status: 'completed',
    completed_at: '2026-09-28T10:15:00Z',
    time_spent_seconds: 700,
    answers_json: [
      { question_id: 'q-sci-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-2', selected_option: 2, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-sci-3', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-7',
    quiz_id: 'quiz-science-1',
    student_id: 'usr-student-6',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-28T11:00:00Z',
    time_spent_seconds: 610,
    answers_json: [
      { question_id: 'q-sci-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-3', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-8',
    quiz_id: 'quiz-science-1',
    student_id: 'usr-student-7',
    score: 10,
    total_possible_score: 20,
    percentage: 50,
    status: 'completed',
    completed_at: '2026-09-28T13:30:00Z',
    time_spent_seconds: 820,
    answers_json: [
      { question_id: 'q-sci-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-2', selected_option: 1, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-sci-3', selected_option: 0, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-sci-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-9',
    quiz_id: 'quiz-science-1',
    student_id: 'usr-student-9',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-28T14:15:00Z',
    time_spent_seconds: 480,
    answers_json: [
      { question_id: 'q-sci-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-3', selected_option: 1, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-10',
    quiz_id: 'quiz-science-1',
    student_id: 'usr-student-10',
    score: 15,
    total_possible_score: 20,
    percentage: 75,
    status: 'completed',
    completed_at: '2026-09-28T16:00:00Z',
    time_spent_seconds: 750,
    answers_json: [
      { question_id: 'q-sci-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-sci-3', selected_option: 2, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-sci-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-11',
    quiz_id: 'quiz-arabic-1',
    student_id: 'usr-student-1',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-28T17:20:00Z',
    time_spent_seconds: 590,
    answers_json: [
      { question_id: 'q-arb-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-3', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-12',
    quiz_id: 'quiz-arabic-1',
    student_id: 'usr-student-2',
    score: 15,
    total_possible_score: 20,
    percentage: 75,
    status: 'completed',
    completed_at: '2026-09-29T08:15:00Z',
    time_spent_seconds: 880,
    answers_json: [
      { question_id: 'q-arb-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-2', selected_option: 1, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-arb-3', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-13',
    quiz_id: 'quiz-arabic-1',
    student_id: 'usr-student-5',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-29T09:40:00Z',
    time_spent_seconds: 710,
    answers_json: [
      { question_id: 'q-arb-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-3', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-arb-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-14',
    quiz_id: 'quiz-tech-1',
    student_id: 'usr-student-9',
    score: 20,
    total_possible_score: 20,
    percentage: 100,
    status: 'completed',
    completed_at: '2026-09-29T10:10:00Z',
    time_spent_seconds: 430,
    answers_json: [
      { question_id: 'q-tech-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-tech-2', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-tech-3', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-tech-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-15',
    quiz_id: 'quiz-tech-1',
    student_id: 'usr-student-10',
    score: 15,
    total_possible_score: 20,
    percentage: 75,
    status: 'completed',
    completed_at: '2026-09-29T11:20:00Z',
    time_spent_seconds: 600,
    answers_json: [
      { question_id: 'q-tech-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-tech-2', selected_option: 1, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-tech-3', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-tech-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-16',
    quiz_id: 'quiz-tech-1',
    student_id: 'usr-student-11',
    score: 10,
    total_possible_score: 20,
    percentage: 50,
    status: 'completed',
    completed_at: '2026-09-29T12:00:00Z',
    time_spent_seconds: 850,
    answers_json: [
      { question_id: 'q-tech-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-tech-2', selected_option: 2, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-tech-3', selected_option: 1, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-tech-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  },
  {
    id: 'sub-deleted-demo-1',
    quiz_id: 'quiz-deleted-demo',
    student_id: 'usr-student-1',
    score: 10,
    total_possible_score: 20,
    percentage: 50,
    status: 'completed',
    completed_at: '2026-09-12T09:30:00Z',
    time_spent_seconds: 520,
    answers_json: [
      { question_id: 'q-math-1', selected_option: 0, is_correct: true, marks_awarded: 5 },
      { question_id: 'q-math-2', selected_option: 0, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-math-3', selected_option: 0, is_correct: false, marks_awarded: 0 },
      { question_id: 'q-math-4', selected_option: 0, is_correct: true, marks_awarded: 5 },
    ]
  }
];
