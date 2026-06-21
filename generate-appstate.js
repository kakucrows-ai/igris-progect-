/**
 * generate-appstate.js
 * Run locally: node generate-appstate.js appstate.json
 * Outputs the base64 string to paste as APPSTATE_JSON in Railway Variables.
 *
 * Fix 1: changed output instructions from "APPSTATE" to "APPSTATE_JSON"
 * to match the variable name actually read by utils/session.js.
 */
const fs   = require('fs');
const path = require('path');

const file = process.argv[2];
if (!file) {
  console.error('Usage: node generate-appstate.js <path-to-appstate.json>');
  process.exit(1);
}

try {
  const raw    = fs.readFileSync(path.resolve(file), 'utf8');
  const base64 = Buffer.from(raw).toString('base64');
  console.log('\n✅ Paste this value as APPSTATE_JSON in Railway Variables:\n');
  console.log(base64);
  console.log();
} catch (e) {
  console.error('❌ Failed to read file:', e.message);
  process.exit(1);
}
