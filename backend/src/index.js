import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import propertiesRoutes from './routes/properties.js';
import adminRoutes from './routes/admin.js';
import walletRoutes from './routes/wallet.js';
import sellerRoutes from './routes/seller.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRoutes);
app.use('/properties', propertiesRoutes);
app.use('/admin', adminRoutes);
app.use('/wallet', walletRoutes);
app.use('/seller', sellerRoutes);

app.use((err, req, res, next) => {
  if (err) {
    return res.status(500).json({ error: 'server error' });
  }
  return next();
});

app.listen(port, '0.0.0.0', () => {
  console.log(`API listening on ${port}`);
});
