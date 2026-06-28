const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const pool    = require('../db');

const router = express.Router();

// Génère un code d'invitation journalier par tenant
function getDailyRegisterCode(slug) {
  const today  = new Date().toISOString().slice(0, 10);
  const secret = process.env.JWT_SECRET || 'fallback-secret';
  const hmac   = crypto.createHmac('sha256', secret);
  hmac.update('register-code:' + slug + ':' + today);
  return hmac.digest('hex').slice(0, 6).toUpperCase();
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, rp_name, password, invite_code, group_code } = req.body;

  if (!username || !rp_name || !password || !invite_code || !group_code) {
    return res.status(400).json({ error: 'Tous les champs sont requis (y compris le code de groupe).' });
  }

  // Lookup tenant by slug
  const tenantRes = await pool.query(
    'SELECT id, name, slug, primary_color, logo_data FROM tenants WHERE LOWER(slug) = LOWER($1)',
    [group_code.trim()]
  );
  if (!tenantRes.rows.length) {
    return res.status(404).json({ error: 'Code de groupe invalide.' });
  }
  const tenant = tenantRes.rows[0];

  if (invite_code.trim().toUpperCase() !== getDailyRegisterCode(tenant.slug)) {
    return res.status(403).json({ error: 'Code d\'invitation invalide ou expiré.' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min. 4 caractères).' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2',
      [username, tenant.id]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Cet identifiant est déjà utilisé dans ce groupe.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, rp_name, password_hash, tenant_id) VALUES ($1, $2, $3, $4) RETURNING id, username, rp_name',
      [username, rp_name, password_hash, tenant.id]
    );

    const user  = result.rows[0];
    const token = jwt.sign(
      {
        id: user.id, username: user.username, rp_name: user.rp_name,
        tenant_id: tenant.id, tenant_name: tenant.name, tenant_slug: tenant.slug,
        tenant_color: tenant.primary_color, tenant_logo: tenant.logo_data,
        is_admin: false, is_super_admin: false,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, rp_name: user.rp_name, is_admin: false },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, color: tenant.primary_color, logo: tenant.logo_data },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password, group_code } = req.body;

  if (!username || !password || !group_code) {
    return res.status(400).json({ error: 'Identifiant, mot de passe et code de groupe requis.' });
  }

  try {
    // Lookup tenant
    const tenantRes = await pool.query(
      'SELECT id, name, slug, primary_color, logo_data FROM tenants WHERE LOWER(slug) = LOWER($1)',
      [group_code.trim()]
    );
    if (!tenantRes.rows.length) {
      return res.status(404).json({ error: 'Code de groupe invalide.' });
    }
    const tenant = tenantRes.rows[0];

    // Find user within tenant
    const result = await pool.query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND tenant_id = $2',
      [username, tenant.id]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }

    const user  = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect.' });
    }

    const token = jwt.sign(
      {
        id: user.id, username: user.username, rp_name: user.rp_name,
        is_admin: user.is_admin, is_super_admin: user.is_super_admin || false,
        tenant_id: tenant.id, tenant_name: tenant.name, tenant_slug: tenant.slug,
        tenant_color: tenant.primary_color, tenant_logo: tenant.logo_data,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, rp_name: user.rp_name, is_admin: user.is_admin, is_super_admin: user.is_super_admin || false },
      tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, color: tenant.primary_color, logo: tenant.logo_data },
    });
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
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
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
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, rp_name, is_admin, is_super_admin, tenant_id`,
      params
    );

    const u = updated.rows[0];

    // Fetch tenant info to include in new token
    const tenantRes = await pool.query(
      'SELECT id, name, slug, primary_color, logo_data FROM tenants WHERE id = $1',
      [u.tenant_id]
    );
    const tenant = tenantRes.rows[0] || {};

    const token = jwt.sign(
      {
        id: u.id, username: u.username, rp_name: u.rp_name,
        is_admin: u.is_admin, is_super_admin: u.is_super_admin || false,
        tenant_id: tenant.id, tenant_name: tenant.name, tenant_slug: tenant.slug,
        tenant_color: tenant.primary_color, tenant_logo: tenant.logo_data,
      },
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
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
