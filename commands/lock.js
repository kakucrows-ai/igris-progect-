const { sendHuman } = require('../utils/human');

/**
 * !lock / !unlock
 * يقفل البوت للمشرفين أو يفتحه للجميع
 * Access: Admin only
 */
module.exports = async function ({ api, event, cmd, config, saveConfig, isAdmin }) {
  if (!isAdmin(event.senderID)) {
    return sendHuman(api, '❌ هذا الأمر للمشرفين فقط.', event.threadID);
  }

  if (cmd === 'lock') {
    config.locked = true;
    saveConfig();
    await sendHuman(api, '🔒 البوت في وضع المشرفين. الأوامر مقيدة.', event.threadID);
  } else if (cmd === 'unlock') {
    config.locked = false;
    saveConfig();
    await sendHuman(api, '🔓 البوت مفتوح للجميع.', event.threadID);
  }
};
