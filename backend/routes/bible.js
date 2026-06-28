const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/bible — toutes les pages du tenant, triées par page_order
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, title, content, page_order, created_at FROM bible_pages WHERE tenant_id = $1 ORDER BY page_order ASC, id ASC',
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Bible fetch error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/bible — admin uniquement
router.post('/', auth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis.' });

  try {
    const orderRes = await pool.query(
      'SELECT COALESCE(MAX(page_order), 0) + 1 AS next_order FROM bible_pages WHERE tenant_id = $1',
      [req.user.tenant_id]
    );
    const next_order = orderRes.rows[0].next_order;

    const result = await pool.query(
      'INSERT INTO bible_pages (title, content, page_order, created_by, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, content, page_order, created_at',
      [title.trim(), content || '', next_order, req.user.id, req.user.tenant_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Bible create error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PUT /api/bible/:id — admin uniquement
router.put('/:id', auth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { title, content } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: 'Titre requis.' });

  try {
    const result = await pool.query(
      'UPDATE bible_pages SET title = $1, content = $2, updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING id, title, content, page_order, created_at',
      [title.trim(), content || '', req.params.id, req.user.tenant_id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Page introuvable.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Bible update error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/bible/reorder — admin uniquement
router.patch('/reorder', auth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  const { order } = req.body;
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Format invalide.' });

  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (let i = 0; i < order.length; i++) {
        await client.query('UPDATE bible_pages SET page_order = $1 WHERE id = $2 AND tenant_id = $3', [i + 1, order[i], req.user.tenant_id]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Bible reorder error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/bible/:id — admin uniquement
router.delete('/:id', auth, async (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: 'Réservé aux administrateurs.' });
  try {
    await pool.query('DELETE FROM bible_pages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Bible delete error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
