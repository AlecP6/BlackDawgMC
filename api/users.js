import { sql, cors, requireAuth, uid } from './_db.js';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  const user = requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux admins' });
    const rows = await sql`SELECT id, username, role, created_at FROM users ORDER BY username`;
    return res.json(rows);
  }

  if (req.method === 'POST') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux admins' });
    const { username, password, role } = req.body;
    const exists = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (exists.length) return res.status(409).json({ error: 'Cet identifiant existe déjà' });
    const id = uid();
    await sql`INSERT INTO users (id, username, password, role) VALUES (${id}, ${username}, ${password}, ${role||'member'})`;
    return res.json({ success: true });
  }

  if (req.method === 'PUT') {
    const { id, username, password, role } = req.body;
    if (user.role !== 'admin' && user.id !== id) return res.status(403).json({ error: 'Accès refusé' });
    if (user.role === 'admin') {
      await sql`UPDATE users SET username=${username}, password=${password}, role=${role} WHERE id=${id}`;
    } else {
      await sql`UPDATE users SET username=${username}, password=${password} WHERE id=${id}`;
    }
    return res.json({ success: true });
  }

  if (req.method === 'DELETE') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux admins' });
    const { id } = req.query;
    if (id === user.id) return res.status(400).json({ error: 'Impossible de se supprimer soi-même' });
    await sql`DELETE FROM users WHERE id = ${id}`;
    return res.json({ success: true });
  }

  res.status(405).end();
}
