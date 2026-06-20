const { sendHuman } = require('../utils/human');

/**
 * !setnick [uid] [لقب] / !setnick clear [uid]
 * يعين كنية أو يمسحها مع الحماية الصامتة
 * Access: Admin only
 */
module.exports = async function ({ api, event, args, config, saveConfig, isAdmin }) {
  if (!isAdmin(event.senderID)) {
    return sendHuman(api, '❌ هذا الأمر للمشرفين فقط.', event.threadID);
  }

  if (args[0] && args[0].toLowerCase() === 'clear') {
    const uid = args[1];
    if (!uid) {
      return sendHuman(api, '❌ استخدم: !setnick clear [uid]', event.threadID);
    }
    api.changeNickname('', event.threadID, uid, async (err) => {
      if (err) return sendHuman(api, '❌ فشل المسح.', event.threadID);
      delete config.nicknames[uid];
      saveConfig();
      await sendHuman(api, `✅ تم مسح كنية ${uid}.`, event.threadID);
    });
    return;
  }

  const uid  = args[0];
  const nick = args.slice(1).join(' ');

  if (!uid || !nick) {
    return sendHuman(api, '❌ استخدم: !setnick [uid] [لقب]', event.threadID);
  }

  api.changeNickname(nick, event.threadID, uid, async (err) => {
    if (err) return sendHuman(api, '❌ فشل تغيير الكنية.', event.threadID);
    config.nicknames[uid] = nick;
    saveConfig();
    await sendHuman(api, `✅ تم تعيين كنية ${uid}: ${nick}`, event.threadID);
  });
};
