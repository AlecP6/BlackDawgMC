const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();

// Helper: insérer un log d'audit (utilisé par les autres routes)
async function addLog(client, { action, entity_type, entity_name, user_id, user_rp_name, details, tenant_id }) {
  await client.query(
    `INSERT INTO audit_logs (action, entity_type, entity_name, user_id, user_rp_name, details, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [action, entity_type, entity_name || null, user_id || null, user_rp_name || null, details || null, tenant_id || null]
  );
}

// GET /api/logs — liste les logs du tenant (limité aux 200 derniers)
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, action, entity_type, entity_name, user_rp_name, details, created_at
       FROM audit_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [req.user.tenant_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = { router, addLog };
