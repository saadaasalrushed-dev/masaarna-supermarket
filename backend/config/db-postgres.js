/**
 * PostgreSQL — same async API as SQLite (runAsync / getAsync / allAsync) when DATABASE_URL is set.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

function buildPool() {
  const conn = process.env.DATABASE_URL;
  const useSsl = process.env.PGSSLMODE !== 'disable' && !/localhost|127\.0\.0\.1/.test(conn || '');
  return new Pool({
    connectionString: conn,
    max: 10,
    ssl: useSsl ? { rejectUnauthorized: false } : false
  });
}

const pool = buildPool();

function prepareQuery(sql, args = []) {
  const trimmed = sql.trim();

  if (/INSERT OR REPLACE INTO settings/i.test(trimmed)) {
    return {
      text: `INSERT INTO settings ("key", value, updated_at) VALUES ($1, $2, NOW())
        ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      values: args
    };
  }
  if (/INSERT OR REPLACE INTO pages/i.test(trimmed)) {
    return {
      text: `INSERT INTO pages (slug, title, content, updated_at) VALUES ($1, $2, $3, NOW())
        ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = EXCLUDED.updated_at`,
      values: args
    };
  }

  let s = sql;
  s = s.replace(/datetime\s*\(\s*'now'\s*,\s*'-30 days'\s*\)/gi, "(NOW() - INTERVAL '30 days')");
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'NOW()');
  s = s.replace(/datetime\('now'\)/g, 'NOW()');
  s = s.replace(/BEGIN IMMEDIATE/gi, 'BEGIN');

  let n = 0;
  s = s.replace(/\?/g, () => `$${++n}`);
  return { text: s, values: args };
}

const db = pool;

db.isPostgres = true;

db.runAsync = async function (sql, ...args) {
  const { text, values } = prepareQuery(sql, args);
  await pool.query(text, values);
};

db.getAsync = async function (sql, ...args) {
  const { text, values } = prepareQuery(sql, args);
  const r = await pool.query(text, values);
  return r.rows[0];
};

db.allAsync = async function (sql, ...args) {
  const { text, values } = prepareQuery(sql, args);
  const r = await pool.query(text, values);
  return r.rows;
};

async function initPgSchema() {
  const sqlPath = path.join(__dirname, 'pg-schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  await pool.query(sql);
  console.log('✅ PostgreSQL schema ready');
}

async function seedIfEmptyPg() {
  const { count } = (await db.getAsync('SELECT COUNT(*)::int as count FROM categories')) || { count: 0 };
  if (Number(count) === 0) {
    const cats = [
      ['beverages', 'Beverages & Tea', 1],
      ['snacks', 'Snacks & Sweets', 2],
      ['dairy', 'Dairy & Chilled', 3],
      ['grains', 'Grains & Pulses', 4],
      ['canned', 'Canned & Preserved', 5],
      ['cleaning', 'Cleaning Supplies', 6],
      ['personal', 'Personal Care', 7]
    ];
    for (const [slug, name, so] of cats) {
      await db.runAsync(
        'INSERT INTO categories (slug, name, sort_order, is_active) VALUES (?,?,?,1)',
        slug,
        name,
        so
      );
    }
  }

  const adminCnt = await db.getAsync('SELECT COUNT(*)::int as c FROM admins');
  if (Number(adminCnt.c) === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await db.runAsync(
      `INSERT INTO admins (username, email, password, name, role, permissions, is_active)
       VALUES ('admin','admin@masaarna.local',?,'Administrator','superadmin','{}',1)`,
      hash
    );
    console.log('✅ Seeded default admin: admin / admin123');
  }

  const prodCnt = await db.getAsync('SELECT COUNT(*)::int as c FROM products');
  if (Number(prodCnt.c) === 0) {
    await db.runAsync(`
      INSERT INTO products (sku, name, brand, description, category, price, stock, weight, origin, images, is_featured, is_bestseller)
      VALUES
      ('CAT-001','Extra Virgin Olive Oil','Masaarna','Cold-pressed','grains',18.50,80,'500ml','Greece','["/assets/catalog/item-01.jpeg","/assets/catalog/item-01.jpeg"]',1,0),
      ('CAT-002','Arabic Coffee','Masaarna','Fine ground','beverages',22.00,120,'250g','UAE','["/assets/catalog/item-02.jpeg","/assets/catalog/item-02.jpeg"]',1,1),
      ('CAT-003','Premium Basmati Rice','Masaarna','Long grain','grains',34.90,60,'5kg','India','["/assets/catalog/item-03.jpeg","/assets/catalog/item-03.jpeg"]',1,0),
      ('CAT-004','Dates Selection','Masaarna','Premium quality','snacks',16.00,90,'400g','UAE','["/assets/catalog/item-04.jpeg","/assets/catalog/item-04.jpeg"]',1,0),
      ('CAT-005','Sparkling Water','Masaarna','Pack','beverages',12.00,200,'1.5L','UAE','["/assets/catalog/item-05.jpeg","/assets/catalog/item-05.jpeg"]',0,1)
    `);
    console.log('✅ Seeded demo catalog (replace images in Admin when ready)');
  }

  const bcnt = await db.getAsync('SELECT COUNT(*)::int as c FROM banners');
  if (Number(bcnt.c) === 0) {
    const rows = [
      ['Fresh picks every week', '/assets/banners/banner-1.svg', '/#shop', 1],
      ['Pantry & household', '/assets/banners/banner-2.svg', '/#shop', 2],
      ['Snacks & beverages', '/assets/banners/banner-3.svg', '/#shop', 3]
    ];
    for (const [title, image_url, link_url, sort_order] of rows) {
      await db.runAsync(
        'INSERT INTO banners (title, image_url, link_url, sort_order, is_active) VALUES (?,?,?,?,1)',
        title,
        image_url,
        link_url,
        sort_order
      );
    }
    console.log('✅ Seeded homepage banners');
  }

  const defaults = [
    ['site.name', 'Masaarna Supermarket', 'general'],
    ['site.tagline', 'Trust & Heritage', 'general'],
    ['site.logo_url', '/assets/brand/logo.svg', 'general'],
    ['social.whatsapp', 'https://wa.me/971500000000', 'contact'],
    ['social.instagram', 'https://www.instagram.com/masaarnasupermarket', 'contact'],
    ['social.tiktok', 'https://www.tiktok.com/@masaarnasupermarket', 'contact'],
    ['social.facebook', '', 'contact'],
    ['social.google_review', '', 'contact'],
    ['contact.phone', '+971 00 000 0000', 'contact'],
    ['contact.email', 'hello@masaarnasupermarket.ae', 'contact'],
    ['contact.map_embed_url', 'https://www.google.com/maps?q=Dubai+UAE&output=embed', 'contact'],
    ['contact.map_link_url', 'https://maps.google.com/?q=Dubai+United+Arab+Emirates', 'contact']
  ];
  for (const [key, value, groupName] of defaults) {
    const row = await db.getAsync('SELECT id FROM settings WHERE "key" = ?', key);
    if (!row) {
      await db.runAsync(
        'INSERT INTO settings ("key", value, group_name, updated_at) VALUES (?,?,?,NOW())',
        key,
        value,
        groupName
      );
    }
  }
}

async function applyLocalCatalogPhotosPg() {
  const fsSync = require('fs');
  const catalogDir = path.join(__dirname, '../../frontend/assets/catalog');
  const item1 = path.join(catalogDir, 'item-01.jpeg');
  if (!fsSync.existsSync(item1)) return;
  const skus = ['CAT-001', 'CAT-002', 'CAT-003', 'CAT-004', 'CAT-005'];
  for (let i = 0; i < skus.length; i++) {
    const url = `/assets/catalog/item-0${i + 1}.jpeg`;
    const j = JSON.stringify([url, url]);
    await db.runAsync('UPDATE products SET images = ? WHERE sku = ?', j, skus[i]);
  }
  console.log('✅ Catalog images synced to /assets/catalog/item-01…05.jpeg');
}

(async () => {
  try {
    await initPgSchema();
    await seedIfEmptyPg();
    await applyLocalCatalogPhotosPg();
  } catch (e) {
    console.error('PostgreSQL boot error:', e);
  }
})();

pool.on('error', (err) => console.error('PostgreSQL pool:', err.message));

console.log('✅ Connected to PostgreSQL');

module.exports = db;
