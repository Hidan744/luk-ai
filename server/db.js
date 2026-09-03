// Node's built-in SQLite (stable since Node 22.5, no native build step needed).
// Run the server with `node --experimental-sqlite server.js` on Node < 24.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = process.env.LUK_DB_PATH || path.join(__dirname, 'luk-ai.db');
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'free',
    subscribed_until TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wardrobe_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    hex TEXT NOT NULL,
    label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

function ensureUser(userId) {
  const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (existing) return existing;
  db.prepare('INSERT INTO users (id) VALUES (?)').run(userId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

function getWardrobe(userId) {
  return db.prepare('SELECT * FROM wardrobe_items WHERE user_id = ? ORDER BY id').all(userId);
}

function addWardrobeItem(userId, { type, hex, label }) {
  ensureUser(userId);
  const info = db.prepare(
    'INSERT INTO wardrobe_items (user_id, type, hex, label) VALUES (?, ?, ?, ?)'
  ).run(userId, type, hex, label);
  return db.prepare('SELECT * FROM wardrobe_items WHERE id = ?').get(info.lastInsertRowid);
}

function deleteWardrobeItem(userId, itemId) {
  const info = db.prepare('DELETE FROM wardrobe_items WHERE id = ? AND user_id = ?').run(itemId, userId);
  return info.changes > 0;
}

function setSubscription(userId, plan, untilISO) {
  ensureUser(userId);
  db.prepare('UPDATE users SET plan = ?, subscribed_until = ? WHERE id = ?').run(plan, untilISO, userId);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
}

module.exports = { db, ensureUser, getWardrobe, addWardrobeItem, deleteWardrobeItem, setSubscription };
