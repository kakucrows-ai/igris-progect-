const os = require('os');
const { sendHuman } = require('../utils/human');

/**
 * !uptime — وقت التشغيل واستهلاك الموارد
 * Access: Everyone (bypasses lock)
 */
module.exports = async function ({ api, event, startTime }) {
  const elapsed = Date.now() - startTime;

  const d = Math.floor(elapsed / 86400000);
  const h = Math.floor((elapsed % 86400000) / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);

  const mem    = process.memoryUsage();
  const heapMB = (mem.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB  = (mem.rss      / 1024 / 1024).toFixed(1);
  const cpu    = os.loadavg()[0].toFixed(2);

  const reply =
    `⏱️ وقت التشغيل: ${d}ي ${h}س ${m}د ${s}ث\n` +
    `🖥️ حِمل المعالج (دقيقة): ${cpu}\n` +
    `🧠 الذاكرة — Heap: ${heapMB} MB | RSS: ${rssMB} MB`;

  await sendHuman(api, reply, event.threadID);
};
