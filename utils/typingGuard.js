/**
 * typingGuard.js
 * دالة موحّدة آمنة لمؤشر الكتابة.
 *
 * لماذا: api.sendTypingIndicator قد تتأخر أو لا تُرجع stopFn أبداً في بعض
 * إصدارات fca-unofficial، مما يُجمّد البوت بصمت. هذا الملف يعالج الثلاثة
 * حالات في مكان واحد بدل تكرار نفس المنطق في كل دالة إرسال.
 */

const TYPING_TIMEOUT_MS = 3000; // الحد الأقصى للانتظار قبل المتابعة بالقوة

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * safeTyping(api, threadID, durationMs)
 *
 * 1) تُطلق sendTypingIndicator مع Promise.race ضد timeout بـ 8 ثوانٍ —
 *    إذا لم تردّ المكتبة خلال 8 ث، نُكمل بدون توقف.
 * 2) تتحقق من typeof stopFn === 'function' قبل استدعائها.
 * 3) تُحيط stopFn() بـ try/catch حتى لا يرمي استثناء صامتاً.
 * 4) تستدعي stopFn دائماً في finally — حتى لو انقطع الاتصال أثناء الانتظار.
 */
async function safeTyping(api, threadID, durationMs) {
  let stopFn = null;

  // المرحلة 1: الحصول على stopFn مع timeout
  await Promise.race([
    new Promise((resolve) => {
      try {
        api.sendTypingIndicator(threadID, (err, stop) => {
          // الحارس: تحقق أن stop دالة فعلاً قبل حفظها
          if (!err && typeof stop === 'function') {
            stopFn = stop;
          }
          resolve();
        });
      } catch (_) {
        // المكتبة رمت مباشرة — لا نوقف التنفيذ
        resolve();
      }
    }),
    // timeout: إذا لم تردّ المكتبة خلال 8 ثوانٍ → نكمل
    sleep(TYPING_TIMEOUT_MS),
  ]);

  // المرحلة 2: انتظر مدة الكتابة ثم أوقف المؤشر في finally دائماً
  try {
    await sleep(durationMs);
  } finally {
    if (stopFn) {
      try {
        stopFn();
      } catch (_) {
        // تجاهل أي خطأ عند إيقاف المؤشر
      }
    }
  }
}

module.exports = { safeTyping, sleep };
