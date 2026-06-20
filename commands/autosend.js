const { sendHuman } = require('../utils/human');

/**
 * !autosend [نص] / !autosend off
 * إرسال تلقائي كل 40 ثانية أو إيقافه
 * Access: Admin only
 */
module.exports = async function ({ api, event, args, config, saveConfig, isAdmin, startAutoSend, stopAutoSend }) {
  if (!isAdmin(event.senderID)) {
    return sendHuman(api, '❌ هذا الأمر للمشرفين فقط.', event.threadID);
  }

  if (args[0] && args[0].toLowerCase() === 'off') {
    stopAutoSend();
    config.autosend = '';
    config.autosendThreadID = '';
    saveConfig();
    return sendHuman(api, '✅ الإرسال التلقائي مُوقَف.', event.threadID);
  }

  const text = args.join(' ');
  if (!text) {
    return sendHuman(api, '❌ استخدم: !autosend [نص] أو !autosend off', event.threadID);
  }

  config.autosend = text;
  config.autosendThreadID = event.threadID;
  saveConfig();
  startAutoSend(api);
  await sendHuman(api, '✅ الإرسال التلقائي مُفعَّل كل 40 ثانية.', event.threadID);
};
