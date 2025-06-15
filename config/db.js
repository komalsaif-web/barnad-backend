const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Error connecting to Supabase PostgreSQL DB:', err.stack);
  }
  console.log('✅ Connected to Supabase PostgreSQL database.');
  release();
});

module.exports = pool;
