import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('WARNING: DATABASE_URL is not set in environment. PostgreSQL queries may fail.');
}

const pool = new Pool({
  connectionString: connectionString,
  // Add SSL settings if necessary (e.g. self-signed certificates on local networks)
  // For standard localhost homelab setups it is usually disabled.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

export const query = (text, params) => pool.query(text, params);
export default pool;
