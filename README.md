# تراز — سامانه‌ی کار و ظرفیت دفتر معماری پرگار

«تراز» سامانه‌ی فارسی و راست‌به‌چپ مدیریت کار، ظرفیت و امور اداری دفتر پرگار است: Taskهای هر پروژه از MDR همان پروژه (Google Sheet) وارد می‌شوند، تیم‌ها آن‌ها را برنامه‌ریزی و اجرا می‌کنند و Status هر سند دوباره در ستون‌های internal همان MDR نوشته می‌شود.

این مخزن دو خروجی دارد که از یک کد ساخته می‌شوند:

| خروجی | چیست | داده |
|---|---|---|
| **نسخه‌ی سروری** (`server/`) | سرور Node.js + PostgreSQL؛ نسخه‌ی اصلی برای استفاده‌ی دفتر | روی سرور، مشترک میان همه، ماندگار |
| **نسخه‌ی نمایشی** (`dist/preview.html`) | یک فایل HTML تنها با داده‌ی نمونه | فقط در همان صفحه |

## معماری

```
مرورگر (React 19 + TypeScript + Tailwind/shadcn)
   │  HTTPS — کوکی نشست HttpOnly
   ▼
server/http.ts ── /api/action ──► sanitize.ts ──► reducer + guard (src/lib/state.ts، src/lib/policy.ts)
   │                                                    │ یک تغییر در هر لحظه، در یک تراکنش
   │◄── /api/state (فقط آنچه همان کاربر مجاز است ببیند: view.ts، به‌صورت Delta)
   │◄── /api/events (SSE: «نسخه‌ی تازه هست»)            ▼
   │                                                PostgreSQL (entities، credentials، sessions، files)
server/jobs.ts ── Sync و Write-back ──► Google Sheets API (حساب سرویس)
```

* **یک منطق، دو جا:** همان reducer و همان قواعد دسترسی (`src/lib/policy.ts`) که در مرورگر هست، روی سرور هم اجرا می‌شود؛ سرور مرجع است.
* **کنترل دسترسی در سرور و API:** هر نوشتن پیش از اجرا با نقش کاربرِ نشست بررسی می‌شود و رد آن در AuditLog امنیتی ثبت می‌شود. هر خواندن از سرور فقط داده‌ای را برمی‌گرداند که همان کاربر اجازه‌ی دیدنش را دارد؛ مثلاً Task و پیوست فضای مالی هرگز برای کاربر عادی فرستاده نمی‌شود، حتی با آدرس مستقیم.
* **داده‌ی شخصی:** کارهای شخصی، اعلان‌ها، تایم‌شیت و درخواست‌های اداری هر کس فقط برای خودش (و نقش‌های مجاز) فرستاده می‌شود؛ شرح Work Log دیگران و یادداشت مرخصی دیگران حذف می‌شود.
* **رمز عبور:** فقط هش scrypt (با salt) در جدول جدا؛ هرگز در داده‌ی برنامه یا پاسخ API نیست. نشست در کوکی `HttpOnly; SameSite=Lax`، تلاش ناموفق ورود محدود می‌شود، و تغییر یا بازنشانی رمز بقیه‌ی نشست‌ها را می‌بندد.
* **ماندگاری:** هر رکورد یک ردیف در `entities` (نوع + شناسه → JSON)؛ هر عمل در یک تراکنش ثبت می‌شود و اگر ثبت نشد، تغییری هم دیده نمی‌شود.

## MDR و قواعد Sync

همه‌ی MDRهای دفتر (مثل بابلسر 458، درروس 386، نوریان 320) یک قالب ثابت دارند؛ Sync همین قالب را می‌خواند (`src/lib/mdrSync.ts`):

* **سطر ۱:** نام پروژه و نوع ساختمان. **سطر ۲:** هدرها. داده از سطر ۳ تا اولین فاصله‌ی سه‌سطری خالی است (جدول‌های راهنمای پایین برگه خوانده نمی‌شوند).
* **ستون‌ها با نام هدر پیدا می‌شوند، نه با حرف ستون** — افزودن ستون تازه Sync را خراب نمی‌کند.
* **سطح هر سطر** از ستون پرشده‌اش: `phase` → Phase، `Stage` → Stage، `summary` → Group، `Docs` → Doc Type، `Document Number` + `Sheets Name` → سند.
* **سلسله‌مراتب از جایگاه سطر** است (هر سطر زیر نزدیک‌ترین سطر سطح بالاتر)؛ ستون‌های Parent 4..1 فقط بررسی می‌شوند و ناهماهنگی هشدار می‌گیرد.
* **شناسه‌ی سطر:** سند با Document Number؛ اگر شماره در MDR تکراری باشد، شماره + نام سند (و هشدار). summary و Docs با کد Serial Number (تغییر نامشان سطر تازه نمی‌سازد).
* **Weight:** سهم از کل پروژه (`0.25%`). اگر همه‌ی هم‌سطح‌ها Weight داشته باشند همان؛ اگر هیچ‌کدام یا فقط بعضی (الگوی رایج: فقط سطر اول وزن والد را دارد) — وزن والد به تساوی تقسیم می‌شود و حالت ناقص هشدار می‌گیرد. `#DIV/0!` و `#N/A` هشدار می‌گیرند.
* **هیچ تغییری بی‌تأیید اعمال نمی‌شود:** سطر جدید، تغییر نام/Weight/Floor/Package/والد و حذف از MDR به صف **Sync Review** می‌رود و کنترل پروژه تأیید یا رد می‌کند. حذف، تسک را پاک نمی‌کند (علامت «Removed from MDR»)؛ بازگشت سطر، همان تسک را با سابقه‌اش برمی‌گرداند. پیشنهاد ردشده تا وقتی آن سطر MDR عوض نشده تکرار نمی‌شود. Sync دوباره صف تکراری نمی‌سازد.
* شماره‌ی ردیف، Plan Issue Date (تاریخ شمسی) و SubTaskها بی‌نیاز به بررسی به‌روز می‌شوند.
* **Write-back:** دو دقیقه بعد از آخرین تغییر Status، ردیف هر سند دوباره با Document Number پیدا می‌شود و **فقط سه ستون** `Last Status Date (internal)` (تاریخ شمسی)، `Last Status (internal)` و `Progress (internal)` (درصد) نوشته می‌شود. خطای شبکه با Retry (۵، ۱۰، ۲۰… دقیقه) تکرار می‌شود؛ خطای یک پروژه Write-back پروژه‌ی دیگر را عقب نمی‌اندازد.
* **زمان‌بندی:** Sync همه‌ی پروژه‌ها هر ۲ ساعت در روزهای کاری (بدون جمعه و تعطیلات) و ساعت ۸ تا ۱۹ تهران؛ و Sync دستی از صفحه‌ی پروژه یا «اجراهای Sync».

## راه‌اندازی سرور

### پیش‌نیازها
* Node.js 22 و pnpm (برای ساخت)، PostgreSQL 14 یا جدیدتر
* یک **حساب سرویس Google** با Google Sheets API فعال (برای Sync و Write-back)

### حساب سرویس Google
1. در Google Cloud Console یک پروژه بسازید و **Google Sheets API** را فعال کنید.
2. یک Service Account بسازید و برایش کلید JSON بگیرید.
3. هر MDR را با ایمیل همان حساب سرویس (`…@….iam.gserviceaccount.com`) با دسترسی **Editor** به اشتراک بگذارید. صفحه‌ی «اجراهای Sync» همین ایمیل را به کنترل پروژه نشان می‌دهد.
4. سرور باید به `oauth2.googleapis.com` و `sheets.googleapis.com` دسترسی شبکه داشته باشد.

### با Docker Compose
```bash
cp .env.example .env            # رمز پایگاه داده و حساب مدیرعامل را بنویسید
mkdir -p secrets && cp ~/Downloads/service-account.json secrets/google-service-account.json
docker compose up -d --build
```
سپس `http://<server>:8080` را باز کنید و با حساب مدیرعامل وارد شوید؛ بقیه‌ی کاربران از صفحه‌ی ورود درخواست عضویت می‌دهند یا مدیر آن‌ها را تعریف می‌کند. پروژه‌ها از «پروژه‌ها › تعریف پروژه» با لینک MDR خودشان تعریف می‌شوند و با «Sync با MDR» وارد صف Sync Review می‌شوند.

### بدون Docker
```bash
pnpm install
bash scripts/build-server.sh          # web-dist/ و server-dist/main.mjs
DATABASE_URL=postgres://taraz:***@localhost:5432/taraz \
TARAZ_ADMIN_USERNAME=ceo TARAZ_ADMIN_PASSWORD='***' \
GOOGLE_SERVICE_ACCOUNT_FILE=/etc/taraz/google-service-account.json \
node server-dist/main.mjs
```

### متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `DATABASE_URL` | — | اتصال PostgreSQL (لازم) |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | |
| `TARAZ_ADMIN_USERNAME`، `TARAZ_ADMIN_PASSWORD`، `TARAZ_ADMIN_NAME` | — | فقط برای اولین اجرا روی پایگاه خالی: حساب مدیرعامل (رمز دست‌کم ۸ نویسه) |
| `TARAZ_SEED` | — | `demo` = پایگاه خالی با داده‌ی نمونه (برای آزمایش؛ رمز همه `pargar1405` یا `TARAZ_DEMO_PASSWORD`) |
| `GOOGLE_SERVICE_ACCOUNT_FILE` یا `GOOGLE_SERVICE_ACCOUNT_JSON` | — | کلید حساب سرویس |
| `TARAZ_SYNC_SCHEDULE` | `on` | `off` = بدون Sync زمان‌بندی‌شده |
| `TARAZ_SYNC_EVERY_HOURS` / `TARAZ_SYNC_HOURS` | `2` / `8-19` | فاصله و ساعت‌های کاری (تهران) |
| `TARAZ_WRITEBACK_DELAY_SEC` | `120` | تأخیر Write-back بعد از آخرین تغییر Status |
| `TARAZ_COOKIE_SECURE` | `0` | پشت HTTPS حتماً `1` |
| `TARAZ_STATIC_DIR` | `web-dist` | پوشه‌ی برنامه‌ی وب |

پشت یک reverse proxy با HTTPS (مثل nginx یا Caddy) اجرا کنید و `TARAZ_COOKIE_SECURE=1` بگذارید؛ برای `/api/events` بافر پاسخ را خاموش کنید (SSE).

### پشتیبان‌گیری
همه‌ی داده (از جمله فایل‌های پیوست) در PostgreSQL است: `pg_dump -Fc taraz > taraz-$(date +%F).dump`

## توسعه و آزمون

```bash
pnpm install
pnpm dev                                   # نسخه‌ی نمایشی با Vite
bash scripts/build-artifact.sh             # dist/preview.html (یک فایل)
bash scripts/build-server.sh               # نسخه‌ی سروری
```

| آزمون | دستور |
|---|---|
| واحد (منطق، دسترسی، MDR) | `node tests/run.mjs tests/<name>.test.ts` — `phase1`، `points`، `worklog`، `gantt`، `admin`، `personal`، `v14`، `release`، `mdr` |
| سرور (PostgreSQL واقعی + جایگزین Google Sheets) | `TEST_PG=postgres://user@host:port/postgres node tests/run.mjs tests/server.test.ts` |
| مرورگر روی نسخه‌ی نمایشی | `node tests/e2e-<name>.cjs` |
| مرورگر روی نسخه‌ی سروری | `TEST_PG=… bash tests/e2e-server.sh core v16 phase1 v14 v15 admin personal points worklog gantt` |
| همه | `bash scripts/test-all.sh` |

## ساختار

```
src/lib/state.ts        reducer و همه‌ی عمل‌ها (بدون React؛ مشترک مرورگر و سرور)
src/lib/policy.ts       نقش‌ها، مجوزها و guard هر عمل
src/lib/mdrSync.ts      خواندن قالب MDR، مقایسه، Write-back
src/lib/collections.ts  مجموعه‌های داده، کلید و ترتیب؛ ادغام Delta
src/lib/remote.ts       اتصال مرورگر به سرور (نسخه‌ی سروری)
server/                 HTTP، احراز هویت، نمای هر کاربر، PostgreSQL، Sync و Write-back
tests/                  آزمون‌ها؛ tests/fixtures/mdr.ts نمونه‌ای از قالب MDR
```
