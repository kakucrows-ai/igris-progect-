const fs   = require('fs');
const path = require('path');

const APPSTATE_PATH = path.resolve('./appstate.json');
const BACKUP_PATH   = path.resolve('./appstate.backup.json');
const SAVE_INTERVAL = 5 * 60 * 1000;

function saveSession(api) {
  try {
    const state = api.getAppState();
    if (fs.existsSync(APPSTATE_PATH)) {
      fs.copyFileSync(APPSTATE_PATH, BACKUP_PATH);
    }
    fs.writeFileSync(APPSTATE_PATH, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('[Session] فشل حفظ الجلسة:', err.message);
  }
}

function startSessionSaver(api) {
  setInterval(() => saveSession(api), SAVE_INTERVAL);
  console.log('[Session] بدأ الحفظ التلقائي كل 5 دقائق');
}

function syncEnvState(api) {
  try {
    const state = api.getAppState();
    process.env.APPSTATE = Buffer.from(JSON.stringify(state)).toString('base64');
  } catch (_) {}
}

module.exports = { saveSession, startSessionSaver, syncEnvState };
