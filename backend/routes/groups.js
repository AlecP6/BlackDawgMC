const express     = require('express');
const pool        = require('../db');
const auth        = require('../middleware/authMiddleware');
const { addLog }  = require('./logs');

const router = express.Router();

// GET /api/groups
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT g.*,
             c.rp_name AS created_by_name,
             u.rp_name AS updated_by_name
      FROM groups g
      LEFT JOIN users c ON g.created_by = c.id
      LEFT JOIN users u ON g.updated_by = u.id
      WHERE g.tenant_id = $1
      ORDER BY g.name ASC
    `, [req.user.tenant_id]);
    res.json(result.rows);
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// POST /api/groups
router.post('/', auth, async (req, res) => {
  const { name, residence, territory, business, company, notes, color, zone_ids, phone } = req.body;

  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom du groupe est requis.' });
  }

  try {
    const result = await pool.query(`
      INSERT INTO groups (name, residence, territory, business, company, notes, color, zone_ids, phone, created_by, updated_by, tenant_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)
      RETURNING *
    `, [
      name.trim(),
      residence?.trim() || null,
      territory?.trim() || null,
      business?.trim()  || null,
      company?.trim()   || null,
      notes?.trim()     || null,
      color || '#ffffff',
      zone_ids || '',
      phone?.trim()     || null,
      req.user.id,
      req.user.tenant_id,
    ]);

    const row = result.rows[0];
    row.created_by_name = req.user.rp_name;
    row.updated_by_name = req.user.rp_name;
    res.status(201).json(row);

    addLog(pool, { action: 'créé', entity_type: 'Groupe', entity_name: name.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name, tenant_id: req.user.tenant_id });
  } catch (err) {
    console.error('Add group error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// PUT /api/groups/:id
router.put('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  const { name, residence, territory, business, company, notes, color, zone_ids, phone } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Le nom du groupe est requis.' });
  }

  try {
    await pool.query(`
      UPDATE groups
      SET name=$1, residence=$2, territory=$3, business=$4, company=$5, notes=$6,
          color=$7, zone_ids=$8, phone=$9, updated_by=$10, updated_at=NOW()
      WHERE id=$11 AND tenant_id=$12
    `, [
      name.trim(),
      residence?.trim() || null,
      territory?.trim() || null,
      business?.trim()  || null,
      company?.trim()   || null,
      notes?.trim()     || null,
      color || '#ffffff',
      zone_ids || '',
      phone?.trim()     || null,
      req.user.id,
      id,
      req.user.tenant_id,
    ]);

    const full = await pool.query(`
      SELECT g.*, c.rp_name AS created_by_name, u.rp_name AS updated_by_name
      FROM groups g
      LEFT JOIN users c ON g.created_by = c.id
      LEFT JOIN users u ON g.updated_by = u.id
      WHERE g.id = $1 AND g.tenant_id = $2
    `, [id, req.user.tenant_id]);

    if (!full.rows.length) return res.status(404).json({ error: 'Groupe introuvable.' });
    res.json(full.rows[0]);

    addLog(pool, { action: 'modifié', entity_type: 'Groupe', entity_name: name.trim(), user_id: req.user.id, user_rp_name: req.user.rp_name, tenant_id: req.user.tenant_id });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// DELETE /api/groups/:id
router.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID invalide.' });

  try {
    const result = await pool.query('DELETE FROM groups WHERE id=$1 AND tenant_id=$2 RETURNING name', [id, req.user.tenant_id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Groupe introuvable.' });
    res.json({ success: true, id });

    addLog(pool, { action: 'supprimé', entity_type: 'Groupe', entity_name: result.rows[0].name, user_id: req.user.id, user_rp_name: req.user.rp_name, tenant_id: req.user.tenant_id });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

module.exports = router;
