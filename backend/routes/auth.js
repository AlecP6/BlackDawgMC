const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');

const router = express.Router();

function getDailyRegisterCode() {
  const today = new Date().toISOString().slice(0, 10);
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update('register-code:' + today);
  return hmac.digest('hex').slice(0, 6).toUpperCase();
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, rp_name, password, invite_code } = req.body;

  if (!username || !rp_name || !password || !invite_code) {
    return res.status(400).json({ error: 'Tous les champs sont requis.' });
  }
  if (invite_code.trim().toUpperCase() !== getDailyRegisterCode()) {
    return res.status(403).json({ error: 'Code d\'invitation invalide ou expiré.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 4 caractères).' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Cet identifiant est déjà utilisé.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, rp_name, password_hash) VALUES ($1, $2, $3) RETURNING id, username, rp_name',
      [username, rp_name, password_hash]
    );

    const user = result.rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, rp_name: user.rp_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user: { id: user.id, username: user.username, rp_name: user.rp_name } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, rp_name: user.rp_name, is_admin: user.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, rp_name: user.rp_name, is_admin: user.is_admin } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/auth/profile
router.patch('/profile', require('../middleware/authMiddleware'), async (req, res) => {
  const { rp_name, current_password, new_password } = req.body;
  if (!rp_name && !new_password)
    return res.status(400).json({ error: 'Rien à mettre à jour.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    const user = result.rows[0];

    const updates = [];
    const params  = [];
    let idx = 1;

    if (rp_name && rp_name.trim()) {
      updates.push(`rp_name = $${idx++}`);
      params.push(rp_name.trim());
    }

    if (new_password) {
      if (!current_password) return res.status(400).json({ error: 'Mot de passe actuel requis.' });
      const valid = await bcrypt.compare(current_password, user.password_hash);
      if (!valid) return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
      if (new_password.length < 4) return res.status(400).json({ error: 'Nouveau mot de passe trop court (min. 4 caractères).' });
      const hashed = await bcrypt.hash(new_password, 10);
      updates.push(`password_hash = $${idx++}`);
      params.push(hashed);
    }

    params.push(req.user.id);
    const updated = await pool.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, rp_name, is_admin`,
      params
    );

    const u = updated.rows[0];
    const token = jwt.sign(
      { id: u.id, username: u.username, rp_name: u.rp_name, is_admin: u.is_admin },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, user: u });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/auth/me
router.get('/me', require('../middleware/authMiddleware'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, rp_name, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
