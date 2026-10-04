# مرفقات الواجبات على Google Drive

افتراضياً تُحفظ صور الواجبات وملفاتها في قاعدة البيانات، وحدّ الخطة المجانية فيها 500 ميجابايت.
بعد هذا الإعداد تُحفظ الملفات الجديدة في مجلد **«إتقان - مرفقات الواجبات»** في Google Drive (حساب المدرسة)،
ويبقى في قاعدة البيانات اسم الملف ورقمه فقط. حدّ الملف يصبح 20 ميجابايت بدل 5.

- الملفات **خاصة**: لا تُشارك في Drive، ولا يفتحها إلا من يملك الصلاحية داخل المنصة (المعلم، طلاب الفصل، أولياء أمورهم، الإدارة).
- الإذن المطلوب من Google هو `drive.file` فقط: المنصة ترى الملفات التي أنشأتها هي فقط، ولا ترى باقي ملفات الحساب.
- لو تعذر الوصول إلى Drive (انتهى الإذن مثلاً) تُحفظ الملفات في قاعدة البيانات مؤقتاً، ويظهر تنبيه للمدير في صفحة الواجبات.
- حذف واجب أو ملف من المنصة يحذفه من Drive تلقائياً.

يستغرق الإعداد حوالي 15 دقيقة، ويتم مرة واحدة.

---

## 1) مشروع في Google Cloud

ادخل بحساب المدرسة على <https://console.cloud.google.com>:

1. من أعلى الصفحة: **Select a project ← New project**. سمّه `Itqan`، ثم **Create**.
2. من القائمة: **APIs & Services ← Library**، وابحث عن **Google Drive API**، ثم **Enable**.

## 2) شاشة الموافقة (OAuth consent screen)

**APIs & Services ← OAuth consent screen** (أو **Google Auth Platform**):

1. **User type**:
   - **Internal** إن ظهر (حساب مدرسة على Google Workspace). هذا الأفضل: الإذن لا ينتهي.
   - وإلا **External**.
2. اسم التطبيق `إتقان`، وبريد الدعم بريدك، ثم احفظ.
3. **Scopes ← Add or remove scopes**: أضف `https://www.googleapis.com/auth/drive.file`.
4. إن اخترت **External**: من **Audience** اضغط **Publish app** (إلى *In production*).
   بدون هذه الخطوة ينتهي الإذن بعد 7 أيام.

## 3) بيانات الدخول (Client ID)

**APIs & Services ← Credentials ← Create credentials ← OAuth client ID**:

1. **Application type**: `Web application`.
2. **Authorized redirect URIs**: أضف `https://developers.google.com/oauthplayground`.
3. **Create**، وانسخ **Client ID** و **Client secret**.

## 4) الإذن الدائم (Refresh token)

1. افتح <https://developers.google.com/oauthplayground>.
2. اضغط ⚙️ (أعلى اليمين) ← فعّل **Use your own OAuth credentials** ← الصق Client ID و Client secret.
3. في **Step 1** اكتب في المربع: `https://www.googleapis.com/auth/drive.file` ← **Authorize APIs**.
4. سجّل الدخول بحساب المدرسة، ووافق.
5. في **Step 2** اضغط **Exchange authorization code for tokens**، وانسخ **Refresh token**.

> إن ظهرت رسالة «تم حظر الوصول» فإدارة حسابات المدرسة تمنع التطبيقات الخارجية.
> اطلب من قسم التقنية السماح للتطبيق (Client ID أعلاه)، أو استمر بالحفظ في قاعدة البيانات.

## 5) الأسرار في GitHub

في المستودع: **Settings ← Secrets and variables ← Actions ← New repository secret**، وأضف:

| الاسم | القيمة |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID |
| `GOOGLE_CLIENT_SECRET` | Client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token |

(`SUPABASE_ACCESS_TOKEN` و `SUPABASE_PROJECT_REF` موجودان من إعداد الإشعارات؛ إن لم يكونا فراجع `.github/workflows/setup-push.yml`.)

لا تضع هذه القيم في أي ملف أو رسالة: مكانها أسرار GitHub فقط.

## 6) التفعيل

1. **Actions ← Supabase migrate**: شغّل `041_homework_drive.sql`.
2. **Actions ← Setup Drive storage ← Run workflow** (mode = `drive`).

سيظهر المجلد في Drive، وفي صفحة الواجبات (للمدير) سطر «الملفات الجديدة تُحفظ في Google Drive».

**للرجوع لقاعدة البيانات**: شغّل نفس سير العمل مع mode = `db`. الملفات المحفوظة في Drive تبقى تعمل.
