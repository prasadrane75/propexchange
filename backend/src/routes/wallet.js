import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, requireRole('buyer', 'admin'), async (req, res) => {
  const result = await query(
    `SELECT i.id, i.shares, i.amount, i.created_at,
            p.id AS property_id, p.title, p.price_total, p.shares_total,
            (p.price_total / p.shares_total) AS price_per_share,
            (p.price_total / p.shares_total) * i.shares AS current_value
     FROM investments i
     JOIN properties p ON p.id = i.property_id
     WHERE i.buyer_id = $1
     ORDER BY i.created_at DESC`,
    [req.user.id]
  );
  const items = result.rows;
  const totalValue = items.reduce((sum, item) => sum + Number(item.current_value || 0), 0);
  return res.json({ items, totalValue });
});

export default router;
