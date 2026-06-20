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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendHuman(api, message, threadID) {
  await sleep(thinkDelay());
  await new Promise((resolve) => {
    api.sendTypingIndicator(threadID, (err, stop) => {
      if (err) return resolve();
      const duration = typingDuration(message);
      setTimeout(() => {
        stop();
        resolve();
      }, duration);
    });
  });
  return new Promise((resolve, reject) => {
    api.sendMessage(message, threadID, (err, info) => {
      if (err) return reject(err);
      resolve(info);
    });
  });
}

async function markReadHuman(api, event) {
  await sleep(Math.floor(Math.random() * 1500) + 300);
  return new Promise((resolve) => {
    api.markAsRead(event.threadID, () => resolve());
  });
}

async function simulateBrowsing() {
  await sleep(browseDelay());
}

module.exports = { sendHuman, markReadHuman, simulateBrowsing, sleep };
