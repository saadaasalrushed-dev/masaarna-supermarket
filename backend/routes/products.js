'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { uploadProductImages } = require('../middleware/imageCompress');
const { authenticateAdmin } = require('../middleware/adminAuth');

router.get('/', async (req, res) => {
  const {
    category, q, filter, origin,
    page = 1, limit = 20,
    sort = 'id', order = 'ASC'
  } = req.query;

  const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  let where = ['p.is_active = 1'];
  const params = [];

  if (category) { where.push('p.category = ?'); params.push(category); }
  if (origin) { where.push('LOWER(p.origin) = ?'); params.push(origin.toLowerCase()); }
  if (q) {
    where.push('(LOWER(p.name) LIKE ? OR LOWER(p.brand) LIKE ?)');
    params.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`);
  }
  if (filter === 'featured') where.push('p.is_featured = 1');
  if (filter === 'bestseller') where.push('p.is_bestseller = 1');
  if (filter === 'new') where.push("p.created_at > datetime('now', '-30 days')");
  if (filter === 'sale') where.push('p.original_price IS NOT NULL');

  const allowedSorts = ['id', 'price', 'rating_avg', 'name', 'created_at'];
  const safeSort = allowedSorts.includes(sort) ? sort : 'id';
  const safeOrder = order === 'DESC' ? 'DESC' : 'ASC';

  const sql = `
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category = c.slug
    WHERE ${where.join(' AND ')}
    ORDER BY p.${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `;
  const countSql = `SELECT COUNT(*) as total FROM products p WHERE ${where.join(' AND ')}`;

  try {
    const products = (await db.allAsync(sql, ...params, parseInt(limit, 10), offset))
      .map(p => ({ ...p, images: JSON.parse(p.images || '[]') }));
    const { total } = await db.getAsync(countSql, ...params);
    res.json({
      products,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.get('/meta/categories', async (req, res) => {
  try {
    const cats = await db.allAsync('SELECT * FROM categories WHERE is_active=1 ORDER BY sort_order');
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/meta/category-counts', async (req, res) => {
  try {
    const counts = await db.allAsync(`
      SELECT c.slug, c.name, COUNT(p.id) as count
      FROM categories c
      LEFT JOIN products p ON c.slug = p.category AND p.is_active = 1
      WHERE c.is_active = 1
      GROUP BY c.slug, c.name
      ORDER BY c.sort_order
    `);
    const total = await db.getAsync('SELECT COUNT(*) as count FROM products WHERE is_active = 1');
    res.json({ categories: counts, total: total.count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search/suggestions', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);
  try {
    const suggestions = (await db.allAsync(`
      SELECT id, name, brand, price, images FROM products
      WHERE is_active=1 AND (LOWER(name) LIKE ? OR LOWER(brand) LIKE ?)
      LIMIT 8
    `, `%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`))
      .map(p => ({ ...p, images: JSON.parse(p.images || '[]') }));
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function flatImagesFromProcessed(list) {
  const out = [];
  if (!list || !list.length) return out;
  for (const proc of list) {
    if (proc.thumbUrl) out.push(proc.thumbUrl, proc.url);
    else out.push(proc.url);
  }
  return out;
}

router.post('/', authenticateAdmin, ...uploadProductImages(12), async (req, res) => {
  const { sku, name, brand, description, category, price, original_price, stock, weight, origin } = req.body;
  const images = JSON.stringify(flatImagesFromProcessed(req.processedImageList));
  try {
    await db.runAsync(`
      INSERT INTO products (sku, name, brand, description, category, price, original_price, stock, weight, origin, images)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `, sku, name, brand, description, category, parseFloat(price),
      original_price ? parseFloat(original_price) : null,
      parseInt(stock || 0, 10), weight, origin, images);
    const product = await db.getAsync('SELECT * FROM products WHERE sku = ?', sku);
    res.status(201).json({ ...product, images: JSON.parse(product.images) });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: `SKU '${sku}' already exists` });
    }
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticateAdmin, ...uploadProductImages(12), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const {
    name, brand, description, category, price, original_price, stock, weight, origin,
    is_featured, is_bestseller, is_active, existing_images
  } = req.body;
  try {
    let sql = `UPDATE products SET name=?, brand=?, description=?, category=?, price=?, original_price=?,
      stock=?, weight=?, origin=?, is_featured=?, is_bestseller=?, updated_at=datetime('now')`;
    const params = [name, brand, description, category, parseFloat(price),
      original_price ? parseFloat(original_price) : null,
      parseInt(stock || 0, 10), weight, origin,
      is_featured ? 1 : 0, is_bestseller ? 1 : 0];
    if (is_active !== undefined) {
      sql += ', is_active=?';
      params.push(is_active === false || is_active === '0' || is_active === 0 ? 0 : 1);
    }
    const hasNewFiles = req.processedImageList && req.processedImageList.length;
    const hasExplicitImages = existing_images !== undefined && existing_images !== null;
    if (hasExplicitImages || hasNewFiles) {
      let base = [];
      if (hasExplicitImages) {
        try {
          const parsed = typeof existing_images === 'string' ? JSON.parse(existing_images) : existing_images;
          base = Array.isArray(parsed) ? parsed : [];
        } catch {
          base = [];
        }
      } else if (hasNewFiles) {
        const row = await db.getAsync('SELECT images FROM products WHERE id=?', id);
        try {
          base = JSON.parse(row.images || '[]');
        } catch {
          base = [];
        }
        if (!Array.isArray(base)) base = [];
      }
      if (hasNewFiles) {
        base = base.concat(flatImagesFromProcessed(req.processedImageList));
      }
      sql += ', images=?';
      params.push(JSON.stringify(base));
    }
    sql += ' WHERE id=?';
    params.push(id);
    await db.runAsync(sql, ...params);
    const product = await db.getAsync('SELECT * FROM products WHERE id = ?', id);
    if (!product) return res.status(404).json({ error: 'Not found' });
    res.json({ ...product, images: JSON.parse(product.images) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    await db.runAsync('UPDATE products SET is_active=0 WHERE id=?', id);
    res.json({ success: true, message: 'Product deactivated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const product = await db.getAsync(`
      SELECT p.*, c.name as category_name
      FROM products p
      LEFT JOIN categories c ON p.category = c.slug
      WHERE p.id = ? AND p.is_active = 1
    `, id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.images = JSON.parse(product.images || '[]');
    const reviews = await db.allAsync(`
      SELECT r.*, u.name as reviewer_name FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.product_id = ? AND r.is_approved = 1
      ORDER BY r.created_at DESC LIMIT 10
    `, id);
    res.json({ ...product, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
