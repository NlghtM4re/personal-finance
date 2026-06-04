const express = require('express');
const db      = require('../db');
const { uid } = require('../utils');
const router  = express.Router();

const DEFAULT_CATEGORIES = [
  { id: 'cat-salary',    name: 'Salary',     icon: '💼', type: 'income',  is_custom: 0 },
  { id: 'cat-freelance', name: 'Freelance',  icon: '💻', type: 'income',  is_custom: 0 },
  { id: 'cat-gift',      name: 'Gift',       icon: '🎁', type: 'income',  is_custom: 0 },
  { id: 'cat-invest',    name: 'Investment', icon: '📈', type: 'income',  is_custom: 0 },
  { id: 'cat-food',      name: 'Food',       icon: '🍔', type: 'expense', is_custom: 0 },
  { id: 'cat-rent',      name: 'Rent',       icon: '🏠', type: 'expense', is_custom: 0 },
  { id: 'cat-transport', name: 'Transport',  icon: '🚗', type: 'expense', is_custom: 0 },
  { id: 'cat-health',    name: 'Health',     icon: '❤️', type: 'expense', is_custom: 0 },
  { id: 'cat-shopping',  name: 'Shopping',   icon: '🛍️', type: 'expense', is_custom: 0 },
  { id: 'cat-entertain', name: 'Fun',        icon: '🎮', type: 'expense', is_custom: 0 },
  { id: 'cat-bills',     name: 'Bills',      icon: '⚡', type: 'expense', is_custom: 0 },
  { id: 'cat-education', name: 'Education',  icon: '📚', type: 'expense', is_custom: 0 },
  { id: 'cat-travel',    name: 'Travel',     icon: '✈️', type: 'expense', is_custom: 0 },
  { id: 'cat-other',     name: 'Other',      icon: '📦', type: 'both',    is_custom: 0 },
];

/* Seed defaults on first run */
const seed = db.prepare('INSERT OR IGNORE INTO categories (id, name, icon, type, is_custom) VALUES (?, ?, ?, ?, ?)');
const seedAll = db.transaction(() => {
  DEFAULT_CATEGORIES.forEach(c => seed.run(c.id, c.name, c.icon, c.type, c.is_custom));
});
seedAll();

/* GET all categories */
router.get('/', (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT * FROM categories';
  const args = [];
  if (type) { sql += " WHERE type = ? OR type = 'both'"; args.push(type); }
  sql += ' ORDER BY is_custom ASC, name ASC';
  res.json(db.prepare(sql).all(...args).map(toCamel));
});

/* POST create custom category */
router.post('/', (req, res) => {
  const { name, icon = '📦', type = 'expense' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uid();
  db.prepare('INSERT INTO categories (id, name, icon, type, is_custom) VALUES (?, ?, ?, ?, 1)')
    .run(id, name, icon, type);
  res.status(201).json(toCamel(db.prepare('SELECT * FROM categories WHERE id = ?').get(id)));
});

/* DELETE custom category */
router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (!row.is_custom) return res.status(403).json({ error: 'Cannot delete default categories' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

function toCamel(row) {
  return { id: row.id, name: row.name, icon: row.icon, type: row.type, isCustom: !!row.is_custom };
}

module.exports = router;
