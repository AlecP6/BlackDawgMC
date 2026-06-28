const express  = require('express');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/authMiddleware');

// Génère le code d'invitation journalier pour un tenant spécifique (slug + date)
function getDailyRegisterCode(slug) {
  const today  = new Date().toISOString().slice(0, 10);
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  const hmac   = crypto.createHmac('sha256', secret);
  hmac.update('register-code:' + slug + ':' + today);
  return hmac.digest('hex').slice(0, 6).toUpperCase();
}

// Middleware : admin seulement (dans le tenant courant)
async function adminOnly(req, res, next) {
  const { rows } = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.is_admin) return res.status(403).json({ error: 'Accès refusé.' });
  next();
}

// GET /api/admin/register-code — retourne le code d'inscription du jour (basé sur le tenant slug)
router.get('/register-code', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT slug FROM tenants WHERE id = $1', [req.user.tenant_id]);
    const slug = rows[0]?.slug || 'default';
    res.json({ code: getDailyRegisterCode(slug) });
  } catch (err) {
    console.error('Register code error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/admin/users — liste les utilisateurs du même tenant
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, rp_name, is_admin, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at ASC',
      [req.user.tenant_id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/admin/users/:id/reset-password
router.patch('/users/:id/reset-password', auth, adminOnly, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 4)
    return res.status(400).json({ error: 'Mot de passe trop court (min. 4 caractères).' });
  try {
    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3', [hashed, req.params.id, req.user.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/admin/users/:id/toggle-admin
router.patch('/users/:id/toggle-admin', auth, adminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE users SET is_admin = NOT is_admin WHERE id = $1 AND tenant_id = $2 RETURNING is_admin',
      [req.params.id, req.user.tenant_id]
    );
    res.json({ is_admin: rows[0].is_admin });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  if (Number(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte.' });
  try {
    await pool.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenant_id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
