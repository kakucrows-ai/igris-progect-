/**
 * session.js
 * إدارة جلسة فيسبوك (appstate.json) مع:
 *  - تطبيع الكوكيز الناقصة (normalizeCookie)
 *  - قراءة الجلسة من القرص المحلي فقط (appstate.json أو appstate.backup.json)
 *  - حفظ دوري يُحدِّث appstate.json على القرص
 */

const fs   = require('fs');
const path = require('path');

const APPSTATE_PATH = path.resolve('./appstate.json');
const BACKUP_PATH   = path.resolve('./appstate.backup.json');
const SAVE_INTERVAL = 5 * 60 * 1000;

// الكوكيز الحساسة التي تحتاج httpOnly
const SENSITIVE_KEYS = new Set(['xs', 'c_user', 'fr']);

// ──────────────────────────────────────────────
// 1. normalizeCookie
//    يُطبَّق على كل كوكي عند القراءة وقبل الحفظ.
//    يُضيف الحقول الناقصة بقيم افتراضية آمنة دون حذف أي حقل موجود.
// ──────────────────────────────────────────────
function normalizeCookie(cookie) {
  const c = { ...cookie };

  // expirationDate: الآن + سنة بالثواني — ضروري لكي تعمل pruneExpired صحيح
  if (c.expirationDate === undefined) {
    c.expirationDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
  }

  // secure: true لجميع كوكيز facebook.com
  if (c.secure === undefined) {
    c.secure = true;
  }

  // httpOnly: true للكوكيز الحساسة فقط (xs, c_user, fr)
  if (c.httpOnly === undefined) {
    c.httpOnly = SENSITIVE_KEYS.has(c.key);
  }

  // sameSite: القيمة التي يتوقعها fca-unofficial
  if (c.sameSite === undefined) {
    c.sameSite = 'no_restriction';
  }

  return c;
}

// ──────────────────────────────────────────────
// 2. _atomicWrite — كتابة آمنة عبر ملف مؤقت ثم rename
// ──────────────────────────────────────────────
function _atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

// ──────────────────────────────────────────────
// 3. loadAppState — قراءة الجلسة من القرص فقط
//    الترتيب: appstate.json ← appstate.backup.json ← خروج صريح
// ──────────────────────────────────────────────
async function loadAppState() {
  // المحاولة 1: الملف الرئيسي
  if (fs.existsSync(APPSTATE_PATH)) {
    try {
      const raw   = fs.readFileSync(APPSTATE_PATH, 'utf8');
      const state = JSON.parse(raw);
      if (Array.isArray(state) && state.length > 0) {
        const normalized = state.map(normalizeCookie);

        // تحذير: إذا أكثر من نصف الكوكيز بدون expirationDate أصلاً
        const missing = state.filter(c => c.expirationDate === undefined).length;
        if (missing > state.length / 2) {
          console.warn(
            `[Session] ⚠️ ${missing}/${state.length} كوكيز بدون expirationDate — appstate.json مُصدَّر بصيغة غير مكتملة`
          );
        }

        console.log('[Session] ✅ تم تحميل appstate.json المحلي');
        return normalized;
      }
    } catch (e) {
      console.error('[Session] خطأ في قراءة appstate.json:', e.message);
    }
  }

  // المحاولة 2: النسخة الاحتياطية
  if (fs.existsSync(BACKUP_PATH)) {
    try {
      const raw   = fs.readFileSync(BACKUP_PATH, 'utf8');
      const state = JSON.parse(raw);
      if (Array.isArray(state) && state.length > 0) {
        console.warn('[Session] ⚠️ استخدام appstate.backup.json');
        return state.map(normalizeCookie);
      }
    } catch (e) {
      console.error('[Session] خطأ في قراءة الاحتياطي:', e.message);
    }
  }

  // لا يوجد مصدر صالح — توقف صريح
  console.error('[Session] ❌ لم يُعثر على appstate.json أو appstate.backup.json صالح — ضع الملف في جذر المشروع وأعد التشغيل');
  process.exit(1);
}

// ──────────────────────────────────────────────
// 4. saveSession — حفظ الجلسة الحالية على القرص
// ──────────────────────────────────────────────
function saveSession(api) {
  try {
    const state      = api.getAppState();
    const normalized = Array.isArray(state) ? state.map(normalizeCookie) : state;

    // نسخة احتياطية أولاً
    if (fs.existsSync(APPSTATE_PATH)) {
      fs.copyFileSync(APPSTATE_PATH, BACKUP_PATH);
    }
    _atomicWrite(APPSTATE_PATH, normalized);
  } catch (err) {
    console.error('[Session] فشل حفظ الجلسة:', err.message);
  }
}

function startSessionSaver(api) {
  setInterval(() => saveSession(api), SAVE_INTERVAL);
  console.log('[Session] بدأ الحفظ التلقائي كل 5 دقائق في appstate.json');
}

module.exports = { loadAppState, saveSession, startSessionSaver, normalizeCookie };
