/**
 * SQLite — async API (sqlite3 + promisify)
 */

'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../masaarna.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB open error:', err.message);
  else console.log('✅ Connected to SQLite');
});

db.runAsync = promisify(db.run.bind(db));
db.getAsync = promisify(db.get.bind(db));
db.allAsync = promisify(db.all.bind(db));

function initSchema() {
  return new Promise((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        name_ar TEXT,
        brand TEXT,
        description TEXT,
        category TEXT NOT NULL,
        price REAL NOT NULL,
        original_price REAL,
        stock INTEGER DEFAULT 0,
        weight TEXT,
        origin TEXT,
        images TEXT DEFAULT '[]',
        is_active INTEGER DEFAULT 1,
        is_featured INTEGER DEFAULT 0,
        is_bestseller INTEGER DEFAULT 0,
        rating_avg REAL DEFAULT 0,
        rating_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        name_ar TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'pending',
        payment_method TEXT DEFAULT 'card',
        payment_status TEXT DEFAULT 'pending',
        ngenius_order_ref TEXT,
        ngenius_payment_ref TEXT,
        subtotal REAL NOT NULL,
        delivery_fee REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        total REAL NOT NULL,
        currency TEXT DEFAULT 'AED',
        customer_name TEXT,
        customer_email TEXT,
        customer_phone TEXT,
        delivery_address TEXT,
        items TEXT DEFAULT '[]',
        notes TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'customer',
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER REFERENCES products(id),
        user_id INTEGER REFERENCES users(id),
        rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
        comment TEXT,
        is_approved INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT,
        role TEXT DEFAULT 'admin',
        permissions TEXT DEFAULT '{}',
        is_active INTEGER DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        type TEXT DEFAULT 'string',
        group_name TEXT DEFAULT 'general',
        description TEXT,
        is_editable INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT,
        api_secret TEXT,
        api_url TEXT,
        outlet_id TEXT,
        merchant_id TEXT,
        is_active INTEGER DEFAULT 1,
        is_test_mode INTEGER DEFAULT 1,
        settings TEXT DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS addons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        version TEXT,
        author TEXT,
        is_active INTEGER DEFAULT 0,
        is_free INTEGER DEFAULT 1,
        settings TEXT DEFAULT '{}',
        installed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER REFERENCES admins(id),
        action TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        title_ar TEXT,
        content TEXT,
        content_ar TEXT,
        meta_title TEXT,
        meta_description TEXT,
        is_published INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS banners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        image_url TEXT,
        link_url TEXT,
        sort_order INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS media_library (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        mime_type TEXT,
        size INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS db_backups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        size INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        body TEXT,
        is_read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
      CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
    `, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Older DB files may have `banners` from before image_url/link_url existed.
 * CREATE TABLE IF NOT EXISTS does not add new columns — migrate in place.
 */
async function migrateBannersTable() {
  try {
    const exist = await db.allAsync("SELECT name FROM sqlite_master WHERE type='table' AND name='banners'");
    if (!exist.length) return;

    const info = await db.allAsync('PRAGMA table_info(banners)');
    const names = new Set(info.map((c) => c.name));

    if (!names.has('title')) {
      await db.runAsync('ALTER TABLE banners ADD COLUMN title TEXT');
    }
    if (!names.has('image_url')) {
      await db.runAsync('ALTER TABLE banners ADD COLUMN image_url TEXT');
      if (names.has('image')) {
        await db.runAsync(
          `UPDATE banners SET image_url = image WHERE image_url IS NULL OR trim(COALESCE(image_url,'')) = ''`
        );
      } else if (names.has('url')) {
        await db.runAsync(
          `UPDATE banners SET image_url = url WHERE image_url IS NULL OR trim(COALESCE(image_url,'')) = ''`
        );
      }
    }
    if (!names.has('link_url')) {
      await db.runAsync('ALTER TABLE banners ADD COLUMN link_url TEXT');
      if (names.has('link')) {
        await db.runAsync(
          `UPDATE banners SET link_url = link WHERE link_url IS NULL OR trim(COALESCE(link_url,'')) = ''`
        );
      }
    }
    if (!names.has('sort_order')) {
      await db.runAsync('ALTER TABLE banners ADD COLUMN sort_order INTEGER DEFAULT 0');
    }
    if (!names.has('is_active')) {
      await db.runAsync('ALTER TABLE banners ADD COLUMN is_active INTEGER DEFAULT 1');
    }
    if (!names.has('created_at')) {
      await db.runAsync("ALTER TABLE banners ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
    }

    // Legacy rows: fill new columns from older field names if still empty.
    try {
      if (names.has('image')) {
        await db.runAsync(
          `UPDATE banners SET image_url = image WHERE (image_url IS NULL OR trim(COALESCE(image_url,'')) = '')
           AND image IS NOT NULL AND trim(COALESCE(image,'')) != ''`
        );
      }
      if (names.has('button_link')) {
        await db.runAsync(
          `UPDATE banners SET link_url = button_link WHERE (link_url IS NULL OR trim(COALESCE(link_url,'')) = '')
           AND button_link IS NOT NULL AND trim(COALESCE(button_link,'')) != ''`
        );
      }
    } catch (e) {
      /* ignore */
    }
  } catch (e) {
    console.error('⚠️ migrateBannersTable:', e.message);
  }
}

async function seedIfEmpty() {
  const { count } = await db.getAsync('SELECT COUNT(*) as count FROM categories') || { count: 0 };
  if (count === 0) {
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
        slug, name, so
      );
    }
  }

  const adminCnt = await db.getAsync('SELECT COUNT(*) as c FROM admins');
  if (adminCnt.c === 0) {
    const hash = await bcrypt.hash('admin123', 10);
    await db.runAsync(
      `INSERT INTO admins (username, email, password, name, role, permissions, is_active)
       VALUES ('admin','admin@masaarna.local',?,'Administrator','superadmin','{}',1)`,
      hash
    );
    console.log('✅ Seeded default admin: admin / admin123');
  }

  const prodCnt = await db.getAsync('SELECT COUNT(*) as c FROM products');
  if (prodCnt.c === 0) {
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

  await seedBannersIfEmpty();
  await seedSiteSettings();
}

/** Point CAT-* products at /assets/catalog/item-0N.jpeg when those files exist (updates existing DBs too). */
async function applyLocalCatalogPhotos() {
  const fs = require('fs');
  const path = require('path');
  const catalogDir = path.join(__dirname, '../../frontend/assets/catalog');
  const item1 = path.join(catalogDir, 'item-01.jpeg');
  if (!fs.existsSync(item1)) return;
  const skus = ['CAT-001', 'CAT-002', 'CAT-003', 'CAT-004', 'CAT-005'];
  for (let i = 0; i < skus.length; i++) {
    const url = `/assets/catalog/item-0${i + 1}.jpeg`;
    const j = JSON.stringify([url, url]);
    await db.runAsync('UPDATE products SET images = ? WHERE sku = ?', j, skus[i]);
  }
  console.log('✅ Catalog images synced to /assets/catalog/item-01…05.jpeg');
}

async function seedBannersIfEmpty() {
  const row = await db.getAsync('SELECT COUNT(*) as c FROM banners');
  if (row.c > 0) return;
  const rows = [
    ['Fresh picks every week', '/assets/banners/banner-1.svg', '/#shop', 1],
    ['Pantry & household', '/assets/banners/banner-2.svg', '/#shop', 2],
    ['Snacks & beverages', '/assets/banners/banner-3.svg', '/#shop', 3]
  ];
  for (const [title, image_url, link_url, sort_order] of rows) {
    await db.runAsync(
      'INSERT INTO banners (title, image_url, link_url, sort_order, is_active) VALUES (?,?,?,?,1)',
      title, image_url, link_url, sort_order
    );
  }
  console.log('✅ Seeded homepage banners');
}

/** Default CMS storefront settings (only insert missing keys). Edit via Admin → Site & social. */
async function seedSiteSettings() {
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
    [
      'contact.map_embed_url',
      'https://www.google.com/maps?q=Dubai+UAE&output=embed',
      'contact'
    ],
    ['contact.map_link_url', 'https://maps.google.com/?q=Dubai+United+Arab+Emirates', 'contact']
  ];
  for (const [key, value, groupName] of defaults) {
    const row = await db.getAsync('SELECT id FROM settings WHERE "key" = ?', key);
    if (!row) {
      await db.runAsync(
        'INSERT INTO settings ("key", value, group_name, updated_at) VALUES (?,?,?,datetime(\'now\'))',
        key,
        value,
        groupName
      );
    }
  }
}

// Boot
(async () => {
  try {
    await initSchema();
    await migrateBannersTable();
    await seedIfEmpty();
    await applyLocalCatalogPhotos();
  } catch (e) {
    console.error('Schema/seed error:', e);
  }
})();

module.exports = db;
