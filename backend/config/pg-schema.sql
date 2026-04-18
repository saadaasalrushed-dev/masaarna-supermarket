-- PostgreSQL schema for Masaarna (Render / any host with DATABASE_URL)
-- Keeps column names aligned with SQLite for shared app code.

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  brand TEXT,
  description TEXT,
  category TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  original_price DOUBLE PRECISION,
  stock INTEGER DEFAULT 0,
  weight TEXT,
  origin TEXT,
  images TEXT DEFAULT '[]',
  is_active INTEGER DEFAULT 1,
  is_featured INTEGER DEFAULT 0,
  is_bestseller INTEGER DEFAULT 0,
  rating_avg DOUBLE PRECISION DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  payment_method TEXT DEFAULT 'card',
  payment_status TEXT DEFAULT 'pending',
  ngenius_order_ref TEXT,
  ngenius_payment_ref TEXT,
  subtotal DOUBLE PRECISION NOT NULL,
  delivery_fee DOUBLE PRECISION DEFAULT 0,
  discount DOUBLE PRECISION DEFAULT 0,
  total DOUBLE PRECISION NOT NULL,
  currency TEXT DEFAULT 'AED',
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  delivery_address TEXT,
  items TEXT DEFAULT '[]',
  notes TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'customer',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  user_id INTEGER REFERENCES users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  is_approved INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT DEFAULT 'admin',
  permissions TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  "key" TEXT UNIQUE NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'string',
  group_name TEXT DEFAULT 'general',
  description TEXT,
  is_editable INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
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
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text),
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS addons (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  author TEXT,
  is_active INTEGER DEFAULT 0,
  is_free INTEGER DEFAULT 1,
  settings TEXT DEFAULT '{}',
  installed_at TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  title_ar TEXT,
  content TEXT,
  content_ar TEXT,
  meta_title TEXT,
  meta_description TEXT,
  is_published INTEGER DEFAULT 1,
  updated_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS banners (
  id SERIAL PRIMARY KEY,
  title TEXT,
  image_url TEXT,
  link_url TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS media_library (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  mime_type TEXT,
  size INTEGER,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS db_backups (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  size INTEGER,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  title TEXT,
  body TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (CURRENT_TIMESTAMP::text)
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
