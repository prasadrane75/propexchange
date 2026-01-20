import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const router = Router();

const ALLOWED_ROLES = new Set(['buyer', 'seller', 'admin']);

router.post('/register', async (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password || !role) {
    return res.status(400).json({ error: 'email, password, role required' });
  }
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(400).json({ error: 'invalid role' });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email.toLowerCase(), passwordHash, role]
    );
    const user = result.rows[0];
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'email already registered' });
    }
    return res.status(500).json({ error: 'registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = result.rows[0];
  if (!user) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const payload = { id: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
  return res.json({ user: payload, token });
});

export default router;
