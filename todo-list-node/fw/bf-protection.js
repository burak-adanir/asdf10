// fw/bf-protection.js
const fs = require('fs');
const path = require('path');

const MAX_ATTEMPTS = 5;
const BLOCK_TIME = 15 * 60 * 1000; // 15 Minuten in ms

// In-Memory-Store: { [ip]: { count, blockedUntil } }
const attempts = {};

// Logt jeden fehlgeschlagenen Versuch mit Timestamp, IP und Username
function logFailed(ip, username) {
  const line = `[${new Date().toISOString()}] FAILED LOGIN: IP=${ip} USER=${username}\n`;
  fs.appendFileSync(
    path.join(__dirname, '../logs/failed-logins.log'),
    line,
    { encoding: 'utf8' }
  );
}

// Middleware: sperrt IP temporär bei zu vielen Fehlversuchen
function bruteForceProtection(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const entry = attempts[ip] || { count: 0, blockedUntil: 0 };
  const now = Date.now();

  if (now < entry.blockedUntil) {
    return res
      .status(429)
      .send('Zu viele Fehleingaben. Bitte 15 Minuten warten.');
  }

  next();
}

// Zählt Fehlversuch und setzt ggf. Sperre
function recordFailure(req) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const entry = attempts[ip] || { count: 0, blockedUntil: 0 };

  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_TIME;
  }
  attempts[ip] = entry;

  const username = req.body?.username || req.query?.username || '-';
  logFailed(ip, username);
}

// Setzt bei Erfolg den Zähler zurück
function resetAttempts(req) {
  const ip = req.ip || req.connection.remoteAddress;
  delete attempts[ip];
}

module.exports = {
  bruteForceProtection,
  recordFailure,
  resetAttempts
};
