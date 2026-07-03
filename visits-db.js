const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS page_visits (
      page TEXT PRIMARY KEY,
      count BIGINT NOT NULL DEFAULT 0
    );
  `);
}

const schemaReady = process.env.DATABASE_URL
  ? initSchema().catch((err) => {
      console.error("visits-db: failed to initialize schema:", err.message);
    })
  : Promise.resolve();

async function recordVisit(page) {
  if (!process.env.DATABASE_URL) return null;
  await schemaReady;
  const { rows } = await pool.query(
    `INSERT INTO page_visits (page, count) VALUES ($1, 1)
     ON CONFLICT (page) DO UPDATE SET count = page_visits.count + 1
     RETURNING count`,
    [page]
  );
  return Number(rows[0].count);
}

async function getVisitCount(page) {
  if (!process.env.DATABASE_URL) return 0;
  await schemaReady;
  const { rows } = await pool.query(`SELECT count FROM page_visits WHERE page = $1`, [page]);
  return rows[0] ? Number(rows[0].count) : 0;
}

module.exports = { recordVisit, getVisitCount };
