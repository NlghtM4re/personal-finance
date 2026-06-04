const express = require('express');
const db      = require('../db');
const { uid } = require('../utils');
const router  = express.Router();

/* GET transactions with optional filters */
router.get('/', (req, res) => {
  const { from, to, categoryId, accountId, type, search, limit = 500, offset = 0 } = req.query;

  let sql    = 'SELECT * FROM transactions WHERE 1=1';
  const args = [];

  if (from)       { sql += ' AND date >= ?';                          args.push(from); }
  if (to)         { sql += ' AND date <= ?';                          args.push(to); }
  if (categoryId) { sql += ' AND category_id = ?';                    args.push(categoryId); }
  if (accountId)  { sql += ' AND (account_id = ? OR to_account_id = ?)'; args.push(accountId, accountId); }
  if (type)       { sql += ' AND type = ?';                           args.push(type); }
  if (search)     { sql += ' AND note LIKE ?';                        args.push(`%${search}%`); }

  sql += ' ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?';
  args.push(Number(limit), Number(offset));

  const rows = db.prepare(sql).all(...args);
  res.json(rows.map(toCamel));
});

/* GET single transaction */
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(toCamel(row));
});

/* POST create transaction */
router.post('/', (req, res) => {
  const { date, amount, type, categoryId, accountId, toAccountId, note = '', tags = [] } = req.body;
  if (!amount || !type || !accountId) {
    return res.status(400).json({ error: 'amount, type, and accountId are required' });
  }
  const id = uid();
  db.prepare(`
    INSERT INTO transactions (id, date, amount, type, category_id, account_id, to_account_id, note, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    date || new Date().toISOString().slice(0, 10),
    Math.abs(Number(amount)),
    type,
    categoryId || null,
    accountId,
    toAccountId || null,
    note,
    JSON.stringify(tags),
  );
  res.status(201).json(toCamel(db.prepare('SELECT * FROM transactions WHERE id = ?').get(id)));
});

/* PUT update transaction */
router.put('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { date, amount, type, categoryId, accountId, toAccountId, note, tags } = req.body;
  db.prepare(`
    UPDATE transactions
    SET date = ?, amount = ?, type = ?, category_id = ?, account_id = ?,
        to_account_id = ?, note = ?, tags = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    date          ?? row.date,
    amount !== undefined ? Math.abs(Number(amount)) : row.amount,
    type          ?? row.type,
    categoryId    !== undefined ? categoryId    : row.category_id,
    accountId     ?? row.account_id,
    toAccountId   !== undefined ? toAccountId   : row.to_account_id,
    note          !== undefined ? note          : row.note,
    tags          !== undefined ? JSON.stringify(tags) : row.tags,
    req.params.id,
  );
  res.json(toCamel(db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id)));
});

/* DELETE transaction */
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* GET summary totals for a date range */
router.get('/summary/totals', (req, res) => {
  const { from, to, accountId } = req.query;
  let sql    = "SELECT type, SUM(amount) as total FROM transactions WHERE type IN ('income','expense')";
  const args = [];
  if (from)      { sql += ' AND date >= ?'; args.push(from); }
  if (to)        { sql += ' AND date <= ?'; args.push(to); }
  if (accountId) { sql += ' AND account_id = ?'; args.push(accountId); }
  sql += ' GROUP BY type';
  const rows   = db.prepare(sql).all(...args);
  const income  = rows.find(r => r.type === 'income')?.total  || 0;
  const expense = rows.find(r => r.type === 'expense')?.total || 0;
  res.json({ income, expense, net: income - expense });
});

function toCamel(row) {
  return {
    id:           row.id,
    date:         row.date,
    amount:       row.amount,
    type:         row.type,
    categoryId:   row.category_id,
    accountId:    row.account_id,
    toAccountId:  row.to_account_id,
    note:         row.note,
    tags:         JSON.parse(row.tags || '[]'),
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}

module.exports = router;
