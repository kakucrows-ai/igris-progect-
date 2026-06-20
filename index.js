require('dotenv').config();

const fs    = require('fs');
const login = require('fca-unofficial');

const { sendHuman, markReadHuman, simulateBrowsing } = require('./utils/human');
const { startSessionSaver, syncEnvState }            = require('./utils/session');

// ──────────────────────────────────────────────
// تحميل config.json إلى الذاكرة
// ──────────────────────────────────────────────
let config;
try {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (e) {
  console.error('[Config] فشل تحميل config.json:', e);
  process.exit(1);
}

// ──────────────────────────────────────────────
// حفظ التغييرات في config.json
// ──────────────────────────────────────────────
function saveConfig() {
  try {
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('[Config] فشل حفظ config.json:', e);
  }
}

// ──────────────────────────────────────────────
// قائمة المشرفين من متغير البيئة
// ──────────────────────────────────────────────
const ADMINS = (process.env.ADMIN_IDS || '')
  .split(',')
  .map(id => id.trim())
  .filter(Boolean);

const isAdmin = (uid) => ADMINS.includes(String(uid));

// ──────────────────────────────────────────────
// الإرسال التلقائي
// ──────────────────────────────────────────────
let autoSendInterval = null;

function startAutoSend(api) {
  if (autoSendInterval) clearInterval(autoSendInterval);
  autoSendInterval = setInterval(() => {
    try {
      if (config.autosend && config.autosendThreadID) {
        api.sendMessage(config.autosend, config.autosendThreadID);
      }
    } catch (e) {
      console.error('[AutoSend] خطأ:', e);
    }
  }, 40 * 1000);
}

function stopAutoSend() {
  if (autoSendInterval) {
    clearInterval(autoSendInterval);
    autoSendInterval = null;
  }
}

// ──────────────────────────────────────────────
// استيراد وحدات الأوامر
// ──────────────────────────────────────────────
const commands = {
  uptime:   require('./commands/uptime'),
  autosend: require('./commands/autosend'),
  setname:  require('./commands/setname'),
  setnick:  require('./commands/setnick'),
  lock:     require('./commands/lock'),
  unlock:   require('./commands/lock'),
  help:     require('./commands/help'),
};

const PREFIX = '!';

// ──────────────────────────────────────────────
// المنطق الداخلي لمعالجة الأحداث — async مستقلة
//
// السبب: listenMqtt تتوقع callback عادية (غير async).
// إذا مرّرنا async مباشرةً، فأي خطأ داخل await يتحول إلى
// Unhandled Promise Rejection يُوقف المستمع بصمت.
// الحل: callback عادية تستدعي handleEvent().catch() بحيث
// أي خطأ يُسجَّل في console.error بدل أن يضيع.
// ──────────────────────────────────────────────
async function handleEvent(api, event, startTime) {
  // تحديث الجلسة في الذاكرة عند كل حدث
  syncEnvState(api);

  // ── الحماية الصامتة لاسم المجموعة ──────────────
  if (
    event.type === 'event' &&
    event.logMessageType === 'log:thread-name' &&
    !isAdmin(event.author)
  ) {
    api.setTitle(config.botName, event.threadID, () => {});
    return;
  }

  // ── الحماية الصامتة للكنى ──────────────────────
  if (
    event.type === 'event' &&
    event.logMessageType === 'log:user-nickname' &&
    !isAdmin(event.author)
  ) {
    const uid       = event.logMessageData && event.logMessageData.participant_id;
    const savedNick = (uid && config.nicknames[uid]) || '';
    if (uid) api.changeNickname(savedNick, event.threadID, uid, () => {});
    return;
  }

  // ── رسائل فقط ──────────────────────────────────
  if (event.type !== 'message') return;

  // قراءة الرسالة بشكل بشري قبل أي معالجة
  await markReadHuman(api, event);

  const body = (event.body || '').trim();
  if (!body.startsWith(PREFIX)) return;

  const parts = body.slice(PREFIX.length).trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1);

  const publicCommands = ['uptime', 'help'];

  // قفل البوت — تجاهل أوامر غير المشرفين بصمت
  if (config.locked && !isAdmin(event.senderID) && !publicCommands.includes(cmd)) {
    return;
  }

  if (!commands[cmd]) return;

  const ctx = {
    api,
    event,
    cmd,
    args,
    config,
    saveConfig,
    isAdmin,
    startTime,
    startAutoSend,
    stopAutoSend,
  };

  await commands[cmd](ctx);
}

// ──────────────────────────────────────────────
// المستمع الرئيسي
// ──────────────────────────────────────────────
function startListener(api, startTime) {
  // ✅ الـ callback هنا دالة عادية (غير async) عمداً —
  // نستدعي handleEvent() ونلتقط أي خطأ بـ .catch()
  // بدلاً من async مباشرة التي تُسكت الأخطاء.
  api.listenMqtt((err, event) => {
    if (err) {
      console.error('[ListenMqtt Error]', err);
      setTimeout(() => startListener(api, startTime), 5000);
      return;
    }

    handleEvent(api, event, startTime).catch((e) => {
      console.error('[handleEvent] خطأ غير متوقع:', e);
    });
  });
}

// ──────────────────────────────────────────────
// تسجيل الدخول وبدء التشغيل
// ──────────────────────────────────────────────
(async () => {
  let appState;
  try {
    const raw = Buffer.from(process.env.APPSTATE, 'base64').toString('utf8');
    appState  = JSON.parse(raw);
  } catch (e) {
    console.error('[Startup] فشل فك تشفير APPSTATE:', e);
    process.exit(1);
  }

  try {
    login({ appState }, (err, api) => {
      if (err) {
        console.error('[Login] فشل تسجيل الدخول:', err);
        process.exit(1);
      }

      console.log('[igris] ✅ تم تسجيل الدخول بنجاح.');

      const startTime = Date.now();

      // حفظ الجلسة كل 5 دقائق
      startSessionSaver(api);

      // استئناف الإرسال التلقائي إن وُجد
      if (config.autosend && config.autosendThreadID) {
        startAutoSend(api);
        console.log('[igris] ▶️ استؤنف الإرسال التلقائي.');
      }

      // حلقة تصفح في الخلفية — تُبقي البوت نشطاً بشكل طبيعي
      // ✅ نفس النمط الآمن: دالة async مستقلة تُلتقط أخطاؤها
      (async function browsingLoop() {
        while (true) {
          await simulateBrowsing().catch((e) => {
            console.error('[browsingLoop] خطأ:', e);
          });
        }
      })();

      startListener(api, startTime);
      console.log('[igris] 👂 البوت يستمع للرسائل...');
    });
  } catch (e) {
    console.error('[Login] استثناء غير متوقع:', e);
    process.exit(1);
  }
})();
