const express = require('express');
const pool    = require('../db');
const auth    = require('../middleware/authMiddleware');

const router = express.Router();

// Middleware : super-admin uniquement
function superAdminOnly(req, res, next) {
  if (!req.user.is_super_admin) return res.status(403).json({ error: 'Accès réservé au super-administrateur.' });
  next();
}

// GET /api/tenants — liste tous les tenants (sans logo pour alléger)
router.get('/', auth, superAdminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, slug, primary_color, created_at FROM tenants ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Get tenants error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/tenants/:id — détail d'un tenant (avec logo)
router.get('/:id', auth, superAdminOnly, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, slug, logo_data, primary_color, created_at FROM tenants WHERE id = $1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant introuvable.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Get tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/tenants — créer un nouveau tenant
router.post('/', auth, superAdminOnly, async (req, res) => {
  const { name, slug, primary_color, logo_data } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Le nom est requis.' });
  if (!slug || !slug.trim()) return res.status(400).json({ error: 'Le code de groupe est requis.' });

  const slugClean = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

  try {
    const { rows } = await pool.query(
      'INSERT INTO tenants (name, slug, primary_color, logo_data) VALUES ($1, $2, $3, $4) RETURNING id, name, slug, primary_color, created_at',
      [name.trim(), slugClean, primary_color || '#ffffff', logo_data || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ce code de groupe est déjà utilisé.' });
    console.error('Create tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PATCH /api/tenants/:id — modifier le branding d'un tenant
router.patch('/:id', auth, superAdminOnly, async (req, res) => {
  const { name, primary_color, logo_data } = req.body;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const updates = [];
    const params  = [];
    let idx = 1;

    if (name && name.trim()) { updates.push(`name = $${idx++}`); params.push(name.trim()); }
    if (primary_color)       { updates.push(`primary_color = $${idx++}`); params.push(primary_color); }
    if (logo_data !== undefined) { updates.push(`logo_data = $${idx++}`); params.push(logo_data || null); }

    if (!updates.length) return res.status(400).json({ error: 'Rien à mettre à jour.' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, name, slug, primary_color, logo_data`,
      params
    );
    if (!rows.length) return res.status(404).json({ error: 'Tenant introuvable.' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Update tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/tenants/:id — supprimer un tenant
router.delete('/:id', auth, superAdminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const { rows } = await pool.query('DELETE FROM tenants WHERE id = $1 RETURNING name', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Tenant introuvable.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
