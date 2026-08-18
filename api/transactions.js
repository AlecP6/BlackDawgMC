import { sql, cors, requireAuth, uid } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const rows = await sql`SELECT * FROM transactions ORDER BY date DESC, created_at DESC`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { date, type, description, category, amount } = req.body;
    const id = uid();
    const rows = await sql`
      INSERT INTO transactions (id, date, type, description, category, amount, created_by)
      VALUES (${id}, ${date}, ${type}, ${description}, ${category}, ${amount}, ${user.username})
      RETURNING *`;
    return res.json(rows[0]);
  }

  if (req.method === 'PUT') {
    const { id, date, type, description, category, amount } = req.body;
    const existing = await sql`SELECT * FROM transactions WHERE id = ${id}`;
    if (!existing.length) return res.status(404).json({ error: 'Introuvable' });
    if (user.role !== 'admin' && existing[0].created_by !== user.username)
      return res.status(403).json({ error: 'Accès refusé' });
    const rows = await sql`
      UPDATE transactions SET date=${date}, type=${type}, description=${description},
      category=${category}, amount=${amount}, updated_by=${user.username}, updated_at=NOW()
      WHERE id=${id} RETURNING *`;
    return res.json(rows[0]);
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    const existing = await sql`SELECT * FROM transactions WHERE id = ${id}`;
    if (!existing.length) return res.status(404).json({ error: 'Introuvable' });
    if (user.role !== 'admin' && existing[0].created_by !== user.username)
      return res.status(403).json({ error: 'Accès refusé' });
    await sql`DELETE FROM transactions WHERE id = ${id}`;
    return res.json({ success: true });
  }

  res.status(405).end();
}
