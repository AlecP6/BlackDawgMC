import { sql, cors, requireAuth, uid } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM groups ORDER BY name`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { name, relation, phones, businesses, notes } = req.body;
    const id = uid();
    const rows = await sql`
      INSERT INTO groups (id, name, relation, phones, businesses, notes, created_by)
      VALUES (${id}, ${name}, ${relation}, ${JSON.stringify(phones||[])}::jsonb, ${JSON.stringify(businesses||[])}::jsonb, ${notes||null}, ${user.username})
      RETURNING *`;
    return res.json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id, name, relation, phones, businesses, notes } = req.body;
    const existing = await sql`SELECT * FROM groups WHERE id = ${id}`;
    if (!existing.length) return res.status(404).json({ error: 'Introuvable' });
    if (user.role !== 'admin' && existing[0].created_by !== user.username)
      return res.status(403).json({ error: 'Accès refusé' });
    const rows = await sql`
      UPDATE groups SET name=${name}, relation=${relation},
      phones=${JSON.stringify(phones||[])}::jsonb, businesses=${JSON.stringify(businesses||[])}::jsonb,
      notes=${notes||null}, updated_by=${user.username}, updated_at=NOW()
      WHERE id=${id} RETURNING *`;
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const existing = await sql`SELECT * FROM groups WHERE id = ${id}`;
    if (!existing.length) return res.status(404).json({ error: 'Introuvable' });
    if (user.role !== 'admin' && existing[0].created_by !== user.username)
      return res.status(403).json({ error: 'Accès refusé' });
    await sql`DELETE FROM groups WHERE id = ${id}`;
    return res.json({ success: true });
  }

  res.status(405).end();
}
