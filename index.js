require('dotenv').config();

const fs    = require('fs');
const login = require('@dongdev/fca-unofficial');

const { sendHuman, markReadHuman, simulateBrowsing } = require('./utils/human');
const { loadAppState, saveSession, startSessionSaver } = require('./utils/session');

// ──────────────────────────────────────────────
// تحميل config.json
// ──────────────────────────────────────────────
let config;
try {
  config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
} catch (e) {
  console.error('[Config] فشل تحميل config.json:', e);
  process.exit(1);
}

function saveConfig() {
  try {
    fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));
  } catch (e) {
    console.error('[Config] فشل حفظ config.json:', e);
  }
}

// ──────────────────────────────────────────────
// المشرفون — مُعرَّفون مباشرةً في الكود
// ──────────────────────────────────────────────
const ADMINS = ['61590560891542', '61591138526841'];

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
        api.sendMessage(config.autosend, config.autosendThreadID, (err) => {
          if (err) console.error('[AutoSend] فشل الإرسال التلقائي:', err);
        });
      }
    } catch (e) {
      console.error('[AutoSend] استثناء:', e);
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
// وحدات الأوامر
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
// معالجة الأحداث — async مستقلة آمنة
// ──────────────────────────────────────────────
async function handleEvent(api, event, startTime) {
  // حماية اسم المجموعة
  if (
    event.type === 'event' &&
    event.logMessageType === 'log:thread-name' &&
    !isAdmin(event.author)
  ) {
    api.setTitle(config.botName, event.threadID, () => {});
    return;
  }

  // حماية الكنى
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

  if (event.type !== 'message') return;

  // fire-and-forget — لا يوقف المعالجة إذا لم تستجب api.markAsRead
  markReadHuman(api, event).catch(() => {});

  const body = (event.body || '').trim();
  if (!body.startsWith(PREFIX)) return;

  const parts = body.slice(PREFIX.length).trim().split(/\s+/);
  const cmd   = parts[0].toLowerCase();
  const args  = parts.slice(1);

  const publicCommands = ['uptime', 'help'];

  if (config.locked && !isAdmin(event.senderID) && !publicCommands.includes(cmd)) return;
  if (!commands[cmd]) return;

  const ctx = {
    api, event, cmd, args, config, saveConfig,
    isAdmin, startTime, startAutoSend, stopAutoSend,
  };

  await commands[cmd](ctx);
}

// ──────────────────────────────────────────────
// مرجع للمستمع الحالي لمنع تراكم مستمعين متعددين
// ──────────────────────────────────────────────
let stopListening = null;

function startListener(api, startTime) {
  // أوقف المستمع السابق إن وُجد قبل بدء جديد
  if (typeof stopListening === 'function') {
    try { stopListening(); } catch (_) {}
    stopListening = null;
  }

  stopListening = api.listenMqtt((err, event) => {
    if (err) {
      console.error('[ListenMqtt Error]', err);
      if (typeof stopListening === 'function') {
        try { stopListening(); } catch (_) {}
        stopListening = null;
      }
      setTimeout(() => startListener(api, startTime), 5000);
      return;
    }
    handleEvent(api, event, startTime).catch((e) => {
      console.error('[handleEvent] خطأ:', e);
    });
  });
}

// ──────────────────────────────────────────────
// إغلاق آمن عند SIGTERM/SIGINT
// ──────────────────────────────────────────────
function setupGracefulShutdown(api) {
  const shutdown = (signal) => {
    console.log(`[igris] إشارة ${signal} — جارٍ حفظ الجلسة...`);
    try { saveSession(api); } catch (_) {}
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

// ──────────────────────────────────────────────
// معالجة الأخطاء غير المتوقعة على مستوى العملية
// ──────────────────────────────────────────────
function setupErrorHandlers(api) {
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err);
    try { saveSession(api); } catch (_) {}
    setTimeout(() => process.exit(1), 3000);
  });

  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason);
    try { saveSession(api); } catch (_) {}
  });
}

// ──────────────────────────────────────────────
// تسجيل الدخول وبدء التشغيل
// ──────────────────────────────────────────────
(async () => {
  const appState = await loadAppState();

  try {
    login({ appState }, (err, api) => {
      if (err) {
        console.error('[Login] فشل تسجيل الدخول:', err);
        process.exit(1);
      }

      console.log('[igris] ✅ تم تسجيل الدخول بنجاح.');

      const startTime = Date.now();

      setupGracefulShutdown(api);
      setupErrorHandlers(api);

      startSessionSaver(api);

      if (config.autosend && config.autosendThreadID) {
        startAutoSend(api);
        console.log('[igris] ▶️ استؤنف الإرسال التلقائي.');
      }

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
