/**
 * session.js
 * إدارة جلسة فيسبوك (appstate.json) مع:
 *  - تطبيع الكوكيز الناقصة (normalizeCookie)
 *  - جلب الجلسة من GitHub كحل احتياطي عند فشل القراءة المحلية
 *  - دعم APPSTATE_JSON كبذرة أولى لبيئات Railway الجديدة
 *  - حفظ دوري يُحدِّث appstate.json على القرص
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

const APPSTATE_PATH = path.resolve('./appstate.json');
const BACKUP_PATH   = path.resolve('./appstate.backup.json');
const SAVE_INTERVAL = 5 * 60 * 1000;

// اسم المستودع يُقرأ من متغير بيئة واحد فقط
const GH_REPO  = process.env.GH_REPO  || 'kakucrows-ai/igris-progect-';
const GH_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

// الكوكيز الحساسة التي تحتاج httpOnly
const SENSITIVE_KEYS = new Set(['xs', 'c_user', 'fr']);
// الكوكيز المهمة التي تحتاج expirationDate افتراضياً
const CRITICAL_KEYS  = new Set(['c_user', 'xs', 'fr', 'datr', 'sb', 'dbln', 'presence', 'wd']);

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
// 3. fetchFromGitHub — جلب appstate.json من GitHub كحل احتياطي
// ──────────────────────────────────────────────
function fetchFromGitHub() {
  return new Promise((resolve, reject) => {
    if (!GH_TOKEN) {
      return reject(new Error('[Session] GH_TOKEN غير مضبوط، لا يمكن جلب الجلسة من GitHub'));
    }

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GH_REPO}/contents/appstate.json`,
      method: 'GET',
      headers: {
        'Authorization': `token ${GH_TOKEN}`,
        'User-Agent':    'igris-bot-session',
        'Accept':        'application/vnd.github.v3+json',
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed  = JSON.parse(raw);
          if (!parsed.content) return reject(new Error('[Session] GitHub: محتوى فارغ'));
          const content = Buffer.from(parsed.content, 'base64').toString('utf8');
          const state   = JSON.parse(content);
          if (!Array.isArray(state)) return reject(new Error('[Session] GitHub: صيغة غير صحيحة'));
          resolve(state);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy(new Error('[Session] انتهت مهلة GitHub'));
    });
    req.end();
  });
}

// ──────────────────────────────────────────────
// 4. loadAppState — تحميل الجلسة مع الاحتياطيات
//    الترتيب: appstate.json ← appstate.backup.json ← GitHub
// ──────────────────────────────────────────────
async function loadAppState() {
  // دعم APPSTATE_JSON كبذرة أولى (JSON أو Base64)
  if (!fs.existsSync(APPSTATE_PATH) && process.env.APPSTATE_JSON) {
    console.log('[Session] APPSTATE_JSON موجود — كتابته على القرص...');
    try {
      let raw = process.env.APPSTATE_JSON.trim();
      // إذا لم يبدأ بـ [ جرّب base64
      if (!raw.startsWith('[') && !raw.startsWith('{')) {
        raw = Buffer.from(raw, 'base64').toString('utf8');
      }
      const state = JSON.parse(raw);
      if (!Array.isArray(state)) throw new Error('صيغة غير صحيحة');
      _atomicWrite(APPSTATE_PATH, state);
      console.log('[Session] ✅ تم كتابة appstate.json من APPSTATE_JSON');
    } catch (e) {
      console.error('[Session] فشل تحليل APPSTATE_JSON:', e.message);
    }
  }

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

  // المحاولة 3: جلب من GitHub
  console.warn('[Session] جميع المصادر المحلية فشلت — جلب من GitHub...');
  try {
    const state = await fetchFromGitHub();
    _atomicWrite(APPSTATE_PATH, state);
    console.log('[Session] ✅ تم جلب appstate.json من GitHub وكتابته محلياً');
    return state.map(normalizeCookie);
  } catch (e) {
    console.error('[Session] فشل جلب GitHub:', e.message);
    // لا يوجد مصدر — توقف صريح مع رسالة واضحة
    console.error('[Session] ❌ لا يوجد appstate صالح — توقف البوت');
    process.exit(1);
    return; // return صريحة بعد exit لمنع تنفيذ أي كود لاحق
  }
}

// ──────────────────────────────────────────────
// 5. saveSession — حفظ الجلسة الحالية على القرص
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

// يُحدِّث process.env للاستخدام الداخلي فقط
function syncEnvState(api) {
  try {
    const state = api.getAppState();
    process.env.APPSTATE = Buffer.from(JSON.stringify(state)).toString('base64');
  } catch (_) {}
}

module.exports = { loadAppState, saveSession, startSessionSaver, syncEnvState, normalizeCookie };
