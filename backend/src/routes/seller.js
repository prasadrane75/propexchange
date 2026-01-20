import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/holdings', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const result = await query(
    `SELECT p.id AS property_id, p.title,
            b.id AS buyer_id, b.email AS buyer_email,
            SUM(i.shares) AS shares,
            SUM(i.amount) AS amount
     FROM properties p
     LEFT JOIN investments i ON i.property_id = p.id
     LEFT JOIN users b ON b.id = i.buyer_id
     WHERE p.seller_id = $1
     GROUP BY p.id, p.title, b.id, b.email
     ORDER BY p.created_at DESC, b.email`,
    [req.user.id]
  );
  const holdings = result.rows;
  return res.json({ holdings });
});

router.get('/properties', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const result = await query(
    `SELECT p.id, p.title, p.description, p.price_total, p.shares_total, p.shares_available,
            p.status, p.created_at,
            (p.price_total / p.shares_total) AS price_per_share,
            (p.price_total / p.shares_total) * p.shares_available AS value_remaining,
            COALESCE(
              json_agg(json_build_object('id', ph.id, 'url', ph.url) ORDER BY ph.position)
              FILTER (WHERE ph.id IS NOT NULL),
              '[]'
            ) AS photos
     FROM properties p
     LEFT JOIN property_photos ph ON ph.property_id = p.id
     WHERE p.seller_id = $1
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  return res.json({ properties: result.rows });
});

export default router;
