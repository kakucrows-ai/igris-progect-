/**
 * human.js
 * محاكاة السلوك البشري في الإرسال والقراءة والتصفح.
 * يستخدم safeTyping من typingGuard.js بدل استدعاء sendTypingIndicator مباشرة.
 */

const { safeTyping, sleep } = require('./typingGuard');

const TYPING_SPEED_MS_PER_CHAR = 45;
const MIN_TYPING = 1000;
const MAX_TYPING = 6000;

function typingDuration(text = '') {
  const base   = text.length * TYPING_SPEED_MS_PER_CHAR;
  const jitter = Math.floor(Math.random() * 800) - 400;
  return Math.min(MAX_TYPING, Math.max(MIN_TYPING, base + jitter));
}

function thinkDelay() {
  return Math.floor(Math.random() * 2000) + 500;
}

function browseDelay() {
  return Math.floor(Math.random() * 5000) + 3000;
}

/**
 * sendHuman — إرسال رسالة مع محاكاة الكتابة البشرية
 * يستخدم safeTyping (timeout + finally) بدل sendTypingIndicator المباشر.
 */
async function sendHuman(api, message, threadID) {
  // تأخير تفكير
  await sleep(thinkDelay());

  // إظهار مؤشر الكتابة بأمان ثم الإرسال
  await safeTyping(api, threadID, typingDuration(message));

  return new Promise((resolve, reject) => {
    api.sendMessage(message, threadID, (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}

/**
 * markReadHuman — تعليم الرسالة كمقروءة مع تأخير عشوائي
 */
async function markReadHuman(api, event) {
  await sleep(Math.floor(Math.random() * 1500) + 300);
  return new Promise((resolve) => {
    api.markAsRead(event.threadID, () => resolve());
  });
}

/**
 * simulateBrowsing — نشاط صامت في الخلفية
 */
async function simulateBrowsing() {
  await sleep(browseDelay());
}

module.exports = { sendHuman, markReadHuman, simulateBrowsing, sleep };
