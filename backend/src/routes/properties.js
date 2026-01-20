import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { query, pool } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
const uploadDir = path.resolve('uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '');
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  },
});
const upload = multer({ storage });

router.get('/', async (req, res) => {
  const result = await query(
    `SELECT p.id, p.seller_id, p.title, p.description, p.price_total, p.shares_total, p.shares_available,
            p.status, p.created_at, u.email AS seller_email,
            (p.price_total / p.shares_total) AS price_per_share,
            (p.price_total / p.shares_total) * p.shares_available AS value_remaining,
            COALESCE(
              json_agg(json_build_object('id', ph.id, 'url', ph.url) ORDER BY ph.position)
              FILTER (WHERE ph.id IS NOT NULL),
              '[]'
            ) AS photos
     FROM properties p
     JOIN users u ON u.id = p.seller_id
     LEFT JOIN property_photos ph ON ph.property_id = p.id
     WHERE p.status = 'approved'
     GROUP BY p.id, u.email
     ORDER BY p.created_at DESC`
  );
  return res.json({ properties: result.rows });
});

router.post('/', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const { title, description, priceTotal, sharesTotal } = req.body || {};
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const priceValue = Number(priceTotal);
  const sharesValue = Number(sharesTotal);
  if (!trimmedTitle) {
    return res.status(400).json({ error: 'title required' });
  }
  if (!Number.isFinite(priceValue) || priceValue <= 0) {
    return res.status(400).json({ error: 'priceTotal must be a positive number' });
  }
  if (!Number.isInteger(sharesValue) || sharesValue <= 0) {
    return res.status(400).json({ error: 'sharesTotal must be a positive integer' });
  }
  const result = await query(
    `INSERT INTO properties (seller_id, title, description, price_total, shares_total, shares_available)
     VALUES ($1, $2, $3, $4, $5, $5)
     RETURNING *`,
    [req.user.id, trimmedTitle, description || '', priceValue, sharesValue]
  );
  const property = result.rows[0];
  const pricePerShare = Number(property.price_total) / Number(property.shares_total);
  const valueRemaining = pricePerShare * Number(property.shares_available);
  return res.status(201).json({
    property: {
      ...property,
      price_per_share: pricePerShare,
      value_remaining: valueRemaining,
    },
  });
});

router.put('/:id', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!propertyId) {
    return res.status(400).json({ error: 'property id required' });
  }
  const { title, description, priceTotal, sharesTotal } = req.body || {};
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const priceValue = Number(priceTotal);
  const sharesValue = Number(sharesTotal);
  if (!trimmedTitle) {
    return res.status(400).json({ error: 'title required' });
  }
  if (!Number.isFinite(priceValue) || priceValue <= 0) {
    return res.status(400).json({ error: 'priceTotal must be a positive number' });
  }
  if (!Number.isInteger(sharesValue) || sharesValue <= 0) {
    return res.status(400).json({ error: 'sharesTotal must be a positive integer' });
  }
  const existing = await query('SELECT * FROM properties WHERE id = $1', [propertyId]);
  const property = existing.rows[0];
  if (!property) {
    return res.status(404).json({ error: 'property not found' });
  }
  if (req.user.role !== 'admin' && property.seller_id !== req.user.id) {
    return res.status(403).json({ error: 'forbidden' });
  }
  const sharesDelta = sharesValue - Number(property.shares_total);
  const newSharesAvailable = Number(property.shares_available) + sharesDelta;
  if (newSharesAvailable < 0) {
    return res.status(400).json({ error: 'sharesTotal less than already sold shares' });
  }
  const nextStatus = req.user.role === 'admin' ? property.status : 'pending';
  const updated = await query(
    `UPDATE properties
     SET title = $1, description = $2, price_total = $3, shares_total = $4, shares_available = $5, status = $6
     WHERE id = $7
     RETURNING *`,
    [trimmedTitle, description || '', priceValue, sharesValue, newSharesAvailable, nextStatus, propertyId]
  );
  const saved = updated.rows[0];
  const pricePerShare = Number(saved.price_total) / Number(saved.shares_total);
  const valueRemaining = pricePerShare * Number(saved.shares_available);
  return res.json({
    property: {
      ...saved,
      price_per_share: pricePerShare,
      value_remaining: valueRemaining,
    },
  });
});

router.post(
  '/:id/photos',
  requireAuth,
  requireRole('seller', 'admin'),
  upload.array('photos', 10),
  async (req, res) => {
    const propertyId = Number(req.params.id);
    if (!propertyId) {
      return res.status(400).json({ error: 'property id required' });
    }
    const existing = await query('SELECT * FROM properties WHERE id = $1', [propertyId]);
    const property = existing.rows[0];
    if (!property) {
      return res.status(404).json({ error: 'property not found' });
    }
    if (req.user.role !== 'admin' && property.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'no files uploaded' });
    }
    const existingPhotos = await query(
      'SELECT COALESCE(MAX(position), 0) AS max_position FROM property_photos WHERE property_id = $1',
      [propertyId]
    );
    let position = Number(existingPhotos.rows[0]?.max_position || 0);
    const inserts = [];
    for (const file of req.files) {
      position += 1;
      inserts.push(
        query(
          `INSERT INTO property_photos (property_id, url, position)
           VALUES ($1, $2, $3)
           RETURNING id, url, position`,
          [propertyId, `/uploads/${file.filename}`, position]
        )
      );
    }
    const results = await Promise.all(inserts);
    const photos = results.map((result) => result.rows[0]);
    return res.status(201).json({ photos });
  }
);

router.delete('/:id', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const propertyId = Number(req.params.id);
  if (!propertyId) {
    return res.status(400).json({ error: 'property id required' });
  }
  try {
    const existing = await query('SELECT * FROM properties WHERE id = $1', [propertyId]);
    const property = existing.rows[0];
    if (!property) {
      return res.status(404).json({ error: 'property not found' });
    }
    if (req.user.role !== 'admin' && property.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const investments = await query(
      'SELECT COUNT(*)::int AS count FROM investments WHERE property_id = $1',
      [propertyId]
    );
    if (investments.rows[0]?.count > 0) {
      return res.status(409).json({ error: 'cannot delete property with investments' });
    }
    await query('DELETE FROM properties WHERE id = $1', [propertyId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'delete failed' });
  }
});

router.post('/:id/investments', requireAuth, requireRole('buyer', 'admin'), async (req, res) => {
  const { shares } = req.body || {};
  const propertyId = Number(req.params.id);
  if (!propertyId || !shares) {
    return res.status(400).json({ error: 'property id and shares required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const propertyResult = await client.query(
      'SELECT * FROM properties WHERE id = $1 FOR UPDATE',
      [propertyId]
    );
    const property = propertyResult.rows[0];
    if (!property) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'property not found' });
    }
    if (property.shares_available < shares) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'not enough shares available' });
    }

    const amount = (Number(property.price_total) / Number(property.shares_total)) * Number(shares);
    await client.query(
      `INSERT INTO investments (buyer_id, property_id, shares, amount)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, propertyId, shares, amount]
    );
    const updated = await client.query(
      'UPDATE properties SET shares_available = shares_available - $1 WHERE id = $2 RETURNING *',
      [shares, propertyId]
    );
    await client.query('COMMIT');
    const updatedProperty = updated.rows[0];
    const pricePerShare = Number(updatedProperty.price_total) / Number(updatedProperty.shares_total);
    const valueRemaining = pricePerShare * Number(updatedProperty.shares_available);
    return res.status(201).json({
      property: {
        ...updatedProperty,
        price_per_share: pricePerShare,
        value_remaining: valueRemaining,
      },
      amount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'investment failed' });
  } finally {
    client.release();
  }
});

export default router;
