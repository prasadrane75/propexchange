import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}
