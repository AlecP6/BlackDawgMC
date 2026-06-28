const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');
const router  = express.Router();

// GET /api/members — membres du même tenant
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, rp_name FROM users WHERE tenant_id = $1 ORDER BY rp_name ASC',
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

// GET /api/members/:id/profile
router.get('/:id/profile', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });
  try {
    const [userRes, weaponsRes, vehiclesRes, txRes] = await Promise.all([
      pool.query('SELECT id, username, rp_name, created_at FROM users WHERE id=$1 AND tenant_id=$2', [id, req.user.tenant_id]),
      pool.query('SELECT id, name, category, notes FROM weapons WHERE assigned_to=$1 AND tenant_id=$2 ORDER BY name ASC', [id, req.user.tenant_id]),
      pool.query('SELECT id, name, category, notes FROM vehicles WHERE assigned_to=$1 AND tenant_id=$2 ORDER BY name ASC', [id, req.user.tenant_id]),
      pool.query(`
        SELECT t.*, u.rp_name AS member_name
        FROM transactions t LEFT JOIN users u ON t.created_by = u.id
        WHERE t.created_by=$1 AND t.tenant_id=$2 ORDER BY t.created_at DESC LIMIT 10
      `, [id, req.user.tenant_id]),
    ]);
    if (!userRes.rows.length) return res.status(404).json({ error: 'Membre introuvable.' });
    res.json({
      user:         userRes.rows[0],
      weapons:      weaponsRes.rows,
      vehicles:     vehiclesRes.rows,
      transactions: txRes.rows,
    });
  } catch { res.status(500).json({ error: 'Erreur serveur.' }); }
});

module.exports = router;
