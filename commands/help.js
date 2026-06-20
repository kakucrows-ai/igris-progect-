const { sendHuman } = require('../utils/human');

/**
 * !help — قائمة الأوامر
 * Access: Everyone (bypasses lock), restricted message if locked
 */
module.exports = async function ({ api, event, config, isAdmin }) {
  if (config.locked && !isAdmin(event.senderID)) {
    return sendHuman(
      api,
      '🔒 البوت في وضع المشرفين.\nلا يمكنك استخدام الأوامر.',
      event.threadID
    );
  }

  const menuText =
    '┌──────────────────────────────┐\n' +
    '│  ⚜  قـائـمـة الأوامـر  ⚜  │\n' +
    '└──────────────────────────────┘\n' +
    '\n' +
    '╔══ 🌐 أوامر عامة ════════════╗\n' +
    '\n' +
    '  🕐 !uptime\n' +
    '  ┗ وقت التشغيل واستهلاك الموارد\n' +
    '\n' +
    '  📋 !help\n' +
    '  ┗ عرض قائمة الأوامر\n' +
    '\n' +
    '╚════════════════════════════╝\n' +
    '\n' +
    '╔══ 👑 أوامر المشرفين ════════╗\n' +
    '\n' +
    '  📡 !autosend [نص / off]\n' +
    '  ┗ إرسال تلقائي كل 40 ثانية\n' +
    '\n' +
    '  ✦ !setname [الاسم]\n' +
    '  ┗ تغيير اسم المجموعة وحمايته\n' +
    '\n' +
    '  ✦ !setnick [uid] [لقب]\n' +
    '  ┗ تعيين كنية وحمايتها من التغيير\n' +
    '\n' +
    '  ✦ !setnick clear [uid]\n' +
    '  ┗ مسح الكنية\n' +
    '\n' +
    '  🔐 !lock  |  🔓 !unlock\n' +
    '  ┗ قفل البوت أو فتحه للجميع\n' +
    '\n' +
    '╚════════════════════════════╝\n' +
    '\n' +
    '  ⚠️ الحماية الصامتة مُفعَّلة دائمًا\n' +
    '  🤖 igris — يعمل على Railway بلا توقف';

  await sendHuman(api, menuText, event.threadID);
};
