import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

async function migrate() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  try {
    const schemaPath = path.join(process.cwd(), 'schema.sql');
    console.log(`Reading schema from ${schemaPath}...`);
    const sql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Running migrations...');
    await client.query(sql);
    console.log('Migrations executed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
