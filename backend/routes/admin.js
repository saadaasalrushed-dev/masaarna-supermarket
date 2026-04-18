'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs').promises;
const path = require('path');
const db = require('../config/db');
const { authenticateAdmin, JWT_SECRET } = require('../middleware/adminAuth');

async function logAudit(adminId, action, entityType, entityId, oldV, newV, req) {
  await db.runAsync(
    `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
     VALUES (?,?,?,?,?,?,?,?)`,
    adminId, action, entityType, entityId || null,
    oldV ? JSON.stringify(oldV) : null,
    newV ? JSON.stringify(newV) : null,
    req.ip || '', req.get('user-agent') || ''
  );
}

router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const admin = await db.getAsync('SELECT * FROM admins WHERE username = ? OR email = ?', username, username);
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  await db.runAsync('UPDATE admins SET last_login = datetime(\'now\') WHERE id = ?', admin.id);
  const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: JSON.parse(admin.permissions || '{}')
    }
  });
});

router.get('/auth/me', authenticateAdmin, (req, res) => {
  res.json({
    admin: {
      id: req.admin.id,
      username: req.admin.username,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
      permissions: req.admin.permissions
    }
  });
});

router.get('/orders', authenticateAdmin, async (req, res) => {
  try {
    const rows = await db.allAsync('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200');
    const orders = rows.map((o) => ({
      ...o,
      items: JSON.parse(o.items || '[]'),
      delivery_address: JSON.parse(o.delivery_address || '{}')
    }));
    res.json({ orders });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
  try {
    const products = await db.getAsync('SELECT COUNT(*) as c FROM products WHERE is_active=1');
    const orders = await db.getAsync('SELECT COUNT(*) as c FROM orders');
    const low = await db.getAsync('SELECT COUNT(*) as c FROM products WHERE stock < 10 AND is_active=1');
    res.json({
      products: products.c,
      orders: orders.c,
      lowStock: low.c,
      revenue: 0
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Full product catalog for CMS (includes inactive). */
router.get('/products', authenticateAdmin, async (req, res) => {
  try {
    const rows = await db.allAsync('SELECT * FROM products ORDER BY updated_at DESC, id DESC LIMIT 1000');
    const products = rows.map((p) => ({ ...p, images: JSON.parse(p.images || '[]') }));
    res.json({ products });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/products/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const row = await db.getAsync(
      `SELECT p.*, c.name as category_name FROM products p
       LEFT JOIN categories c ON p.category = c.slug WHERE p.id = ?`,
      id
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    row.images = JSON.parse(row.images || '[]');
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/categories', authenticateAdmin, async (req, res) => {
  try {
    const categories = await db.allAsync('SELECT * FROM categories ORDER BY sort_order, name');
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/categories', authenticateAdmin, async (req, res) => {
  try {
    const { slug, name, name_ar, sort_order } = req.body;
    if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });
    const clean = String(slug)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    if (!clean) return res.status(400).json({ error: 'Invalid slug' });
    await db.runAsync(
      `INSERT INTO categories (slug, name, name_ar, sort_order, is_active) VALUES (?,?,?,?,1)`,
      clean,
      String(name).trim(),
      name_ar != null ? String(name_ar) : '',
      parseInt(sort_order, 10) || 0
    );
    const { id } = await db.getAsync('SELECT last_insert_rowid() AS id');
    const row = await db.getAsync('SELECT * FROM categories WHERE id = ?', id);
    await logAudit(req.admin.id, 'create', 'category', id, null, row, req);
    res.status(201).json(row);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'That category slug already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const { name, name_ar, sort_order, is_active } = req.body;
    await db.runAsync(
      `UPDATE categories SET name=?, name_ar=?, sort_order=?, is_active=? WHERE id=?`,
      String(name || '').trim(),
      name_ar != null ? String(name_ar) : '',
      parseInt(sort_order, 10) || 0,
      is_active === false || is_active === 0 || is_active === '0' ? 0 : 1,
      id
    );
    const row = await db.getAsync('SELECT * FROM categories WHERE id = ?', id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    await logAudit(req.admin.id, 'update', 'category', id, null, row, req);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const cat = await db.getAsync('SELECT slug FROM categories WHERE id = ?', id);
    if (!cat) return res.status(404).json({ error: 'Not found' });
    const { c } = await db.getAsync('SELECT COUNT(*) as c FROM products WHERE category = ?', cat.slug);
    if (c > 0) {
      return res.status(400).json({ error: 'Move or delete products in this category first.' });
    }
    await db.runAsync('DELETE FROM categories WHERE id = ?', id);
    await logAudit(req.admin.id, 'delete', 'category', id, null, null, req);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/cms/summary', authenticateAdmin, async (req, res) => {
  try {
    const [activeP, allP, ord, low, pages, banners] = await Promise.all([
      db.getAsync('SELECT COUNT(*) as c FROM products WHERE is_active=1'),
      db.getAsync('SELECT COUNT(*) as c FROM products'),
      db.getAsync('SELECT COUNT(*) as c FROM orders'),
      db.getAsync('SELECT COUNT(*) as c FROM products WHERE stock < 10 AND is_active=1'),
      db.getAsync('SELECT COUNT(*) as c FROM pages'),
      db.getAsync('SELECT COUNT(*) as c FROM banners WHERE is_active=1')
    ]);
    res.json({
      productsActive: activeP.c,
      productsTotal: allP.c,
      orders: ord.c,
      lowStock: low.c,
      pages: pages.c,
      banners: banners.c
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/settings', authenticateAdmin, async (req, res) => {
  const rows = await db.allAsync('SELECT * FROM settings ORDER BY group_name, "key"');
  res.json({ settings: rows, raw: rows });
});

router.put('/settings', authenticateAdmin, async (req, res) => {
  const body = req.body.settings || req.body;
  if (typeof body === 'object' && !Array.isArray(body)) {
    for (const [k, v] of Object.entries(body)) {
      await db.runAsync('INSERT OR REPLACE INTO settings ("key", value, updated_at) VALUES (?,?,datetime(\'now\'))', k, String(v));
    }
  }
  await logAudit(req.admin.id, 'update', 'settings', null, null, body, req);
  res.json({ success: true });
});

router.get('/banners', authenticateAdmin, async (req, res) => {
  const banners = await db.allAsync('SELECT * FROM banners ORDER BY sort_order');
  res.json(banners);
});

router.post('/banners', authenticateAdmin, async (req, res) => {
  try {
    const { title, image_url, link_url, sort_order, is_active } = req.body;
    await db.runAsync(
      `INSERT INTO banners (title, image_url, link_url, sort_order, is_active) VALUES (?,?,?,?,?)`,
      title || null,
      image_url || '',
      link_url || '',
      parseInt(sort_order, 10) || 0,
      is_active === false || is_active === 0 ? 0 : 1
    );
    const { id } = await db.getAsync('SELECT last_insert_rowid() AS id');
    const row = await db.getAsync('SELECT * FROM banners WHERE id = ?', id);
    await logAudit(req.admin.id, 'create', 'banner', id, null, row, req);
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/banners/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const { title, image_url, link_url, sort_order, is_active } = req.body;
    await db.runAsync(
      `UPDATE banners SET title=?, image_url=?, link_url=?, sort_order=?, is_active=? WHERE id=?`,
      title || null,
      image_url || '',
      link_url || '',
      parseInt(sort_order, 10) || 0,
      is_active === false || is_active === 0 ? 0 : 1,
      id
    );
    const row = await db.getAsync('SELECT * FROM banners WHERE id = ?', id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    await logAudit(req.admin.id, 'update', 'banner', id, null, row, req);
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/banners/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    await db.runAsync('DELETE FROM banners WHERE id = ?', id);
    await logAudit(req.admin.id, 'delete', 'banner', id, null, null, req);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/pages', authenticateAdmin, async (req, res) => {
  const pages = await db.allAsync('SELECT slug, title, is_published FROM pages');
  res.json(pages);
});

router.get('/pages/:slug', authenticateAdmin, async (req, res) => {
  const p = await db.getAsync('SELECT * FROM pages WHERE slug = ?', req.params.slug);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

router.put('/pages/:slug', authenticateAdmin, async (req, res) => {
  const { title, content } = req.body;
  await db.runAsync(
    'INSERT OR REPLACE INTO pages (slug, title, content, updated_at) VALUES (?,?,?,datetime(\'now\'))',
    req.params.slug, title || '', content || ''
  );
  res.json({ success: true });
});

router.get('/api-keys', authenticateAdmin, async (req, res) => {
  res.json(await db.allAsync('SELECT id, name, provider, is_active, is_test_mode FROM api_keys'));
});

router.get('/addons', authenticateAdmin, async (req, res) => {
  res.json(await db.allAsync('SELECT * FROM addons'));
});

router.post('/addons/:code/activate', authenticateAdmin, async (req, res) => {
  await db.runAsync('UPDATE addons SET is_active=1, installed_at=datetime(\'now\') WHERE code=?', req.params.code);
  res.json({ success: true });
});

router.post('/addons/:code/deactivate', authenticateAdmin, async (req, res) => {
  await db.runAsync('UPDATE addons SET is_active=0 WHERE code=?', req.params.code);
  res.json({ success: true });
});

router.get('/audit-logs', authenticateAdmin, async (req, res) => {
  const logs = await db.allAsync('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100');
  res.json(logs);
});

router.post('/database/backup', authenticateAdmin, async (req, res) => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../masaarna.db');
  const name = `backup-${Date.now()}.db`;
  const dest = path.join(__dirname, '../uploads', name);
  await fs.copyFile(dbPath, dest);
  await db.runAsync('INSERT INTO db_backups (filename, size) VALUES (?,?)', name, (await fs.stat(dest)).size);
  res.json({ success: true, file: name });
});

router.get('/database/backups', authenticateAdmin, async (req, res) => {
  res.json(await db.allAsync('SELECT * FROM db_backups ORDER BY created_at DESC'));
});

router.get('/admins', authenticateAdmin, async (req, res) => {
  if (req.admin.role !== 'superadmin') return res.status(403).json({ error: 'Forbidden' });
  const rows = await db.allAsync('SELECT id, username, email, name, role, is_active, last_login FROM admins');
  res.json(rows);
});

module.exports = router;
