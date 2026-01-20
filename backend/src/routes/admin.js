import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  const result = await query('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC');
  return res.json({ users: result.rows });
});

router.get('/properties/pending', requireAuth, requireRole('admin'), async (req, res) => {
  const result = await query(
    `SELECT p.id, p.title, p.description, p.price_total, p.shares_total, p.shares_available,
            p.status, p.created_at, u.email AS seller_email
     FROM properties p
     JOIN users u ON u.id = p.seller_id
     WHERE p.status = 'pending'
     ORDER BY p.created_at DESC`
  );
  return res.json({ properties: result.rows });
});

router.post('/properties/:id/approve', requireAuth, requireRole('admin'), async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!propertyId) {
    return res.status(400).json({ error: 'property id required' });
  }
  const updated = await query(
    `UPDATE properties SET status = 'approved' WHERE id = $1 RETURNING *`,
    [propertyId]
  );
  const property = updated.rows[0];
  if (!property) {
    return res.status(404).json({ error: 'property not found' });
  }
  const pricePerShare = Number(property.price_total) / Number(property.shares_total);
  const valueRemaining = pricePerShare * Number(property.shares_available);
  return res.json({
    property: {
      ...property,
      price_per_share: pricePerShare,
      value_remaining: valueRemaining,
    },
  });
});

export default router;
