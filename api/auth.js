import { sql, cors } from './_db.js';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Champs manquants' });

  const rows = await sql`SELECT * FROM users WHERE username = ${username} AND password = ${password}`;
  if (!rows.length) return res.status(401).json({ error: 'Identifiant ou mot de passe incorrect' });

  const user = rows[0];
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
}
