const { sendHuman } = require('../utils/human');

/**
 * !setname [الاسم]
 * يغير اسم المجموعة ويحفظه للحماية الصامتة
 * Access: Admin only
 */
module.exports = async function ({ api, event, args, config, saveConfig, isAdmin }) {
  if (!isAdmin(event.senderID)) {
    return sendHuman(api, '❌ هذا الأمر للمشرفين فقط.', event.threadID);
  }

  const newName = args.join(' ');
  if (!newName) {
    return sendHuman(api, '❌ حدد اسمًا. مثال: !setname igris', event.threadID);
  }

  api.setTitle(newName, event.threadID, async (err) => {
    if (err) {
      return sendHuman(api, '❌ فشل تغيير الاسم.', event.threadID);
    }
    config.botName = newName;
    saveConfig();
    await sendHuman(api, `✅ تم تغيير الاسم إلى: ${newName}`, event.threadID);
  });
};
