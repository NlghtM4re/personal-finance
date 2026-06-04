const express = require('express');
const db      = require('../db');
const { uid } = require('../utils');
const router  = express.Router();

/* GET all accounts */
router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY created_at ASC').all();
  res.json(accounts.map(toCamel));
});

/* GET single account */
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(toCamel(row));
});

/* POST create account */
router.post('/', (req, res) => {
  const { name, type = 'bank', initialBalance = 0, color = '#6366f1' } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const id = uid();
  db.prepare(`
    INSERT INTO accounts (id, name, type, initial_balance, color)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, type, Number(initialBalance), color);
  res.status(201).json(toCamel(db.prepare('SELECT * FROM accounts WHERE id = ?').get(id)));
});

/* PUT update account */
router.put('/:id', (req, res) => {
  const { name, type, initialBalance, color } = req.body;
  const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE accounts SET name = ?, type = ?, initial_balance = ?, color = ?
    WHERE id = ?
  `).run(
    name ?? row.name,
    type ?? row.type,
    initialBalance !== undefined ? Number(initialBalance) : row.initial_balance,
    color ?? row.color,
    req.params.id
  );
  res.json(toCamel(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id)));
});

/* DELETE account */
router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* GET account balance */
router.get('/:id/balance', (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id);
  if (!account) return res.status(404).json({ error: 'Not found' });
  const txs = db.prepare(
    'SELECT * FROM transactions WHERE account_id = ? OR to_account_id = ?'
  ).all(req.params.id, req.params.id);
  const balance = txs.reduce((bal, t) => {
    if (t.type === 'income'   && t.account_id    === req.params.id) return bal + t.amount;
    if (t.type === 'expense'  && t.account_id    === req.params.id) return bal - t.amount;
    if (t.type === 'transfer' && t.account_id    === req.params.id) return bal - t.amount;
    if (t.type === 'transfer' && t.to_account_id === req.params.id) return bal + t.amount;
    return bal;
  }, account.initial_balance);
  res.json({ balance });
});

function toCamel(row) {
  return {
    id:             row.id,
    name:           row.name,
    type:           row.type,
    initialBalance: row.initial_balance,
    color:          row.color,
    createdAt:      row.created_at,
  };
}

module.exports = router;
