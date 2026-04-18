/**
 * Authoritative cart lines from DB: re-price, validate stock, return normalized items + totals.
 * Used by POST /api/orders and payment order creation.
 */

'use strict';

const db = require('../config/db');

const PRICE_EPSILON = 0.02;

function readMinOrderAed() {
  const raw = process.env.MIN_ORDER_AED;
  if (raw === undefined || raw === '') return 1;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 1;
}

const MIN_ORDER_AED = readMinOrderAed();

/**
 * @param {Array<{id:number,qty:number}>} rawItems - minimal: product id + quantity (client may send more; we ignore price)
 * @returns {Promise<{ ok: boolean, error?: string, items?: Array, subtotal?: number }>}
 */
async function resolveOrderLines(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: 'Cart is empty' };
  }

  const normalized = [];
  let subtotal = 0;

  for (const line of rawItems) {
    const id = parseInt(line.id, 10);
    const qty = parseInt(line.qty, 10);
    if (Number.isNaN(id) || id < 1 || Number.isNaN(qty) || qty < 1) {
      return { ok: false, error: 'Invalid line item' };
    }

    const row = await db.getAsync(
      `SELECT id, sku, name, price, stock, images, is_active FROM products WHERE id = ?`,
      id
    );

    if (!row || !row.is_active) {
      return { ok: false, error: `Product unavailable (id ${id})` };
    }

    if (row.stock < qty) {
      return {
        ok: false,
        error: `Insufficient stock for "${row.name}" (available ${row.stock}, requested ${qty})`
      };
    }

    const unit = Number(row.price);
    const lineTotal = Math.round(unit * qty * 100) / 100;
    subtotal += lineTotal;

    let images = [];
    try {
      images = JSON.parse(row.images || '[]');
    } catch (e) {
      images = [];
    }

    normalized.push({
      id: row.id,
      sku: row.sku,
      name: row.name,
      price: unit,
      qty,
      image: images[0] || null
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  return { ok: true, items: normalized, subtotal };
}

/**
 * Compare client-reported subtotal to server subtotal (optional check when client sends prices).
 */
function subtotalsMatch(clientSubtotal, serverSubtotal) {
  const a = Number(clientSubtotal);
  const b = Number(serverSubtotal);
  if (Number.isNaN(a)) return false;
  return Math.abs(a - b) <= PRICE_EPSILON;
}

/** Map client cart items to { id, qty } only (ignore tampered price/name). */
function normalizeCartPayload(items) {
  if (!Array.isArray(items)) return [];
  return items.map(i => ({
    id: parseInt(i.id, 10),
    qty: parseInt(i.qty, 10)
  })).filter(i => !Number.isNaN(i.id) && i.id > 0 && !Number.isNaN(i.qty) && i.qty > 0);
}

/**
 * Decrease stock after order is persisted. Re-checks stock to reduce race issues (use DB transaction in route for production).
 */
async function decrementStocksForLines(items) {
  for (const line of items) {
    const row = await db.getAsync('SELECT stock FROM products WHERE id = ?', line.id);
    if (!row || row.stock < line.qty) {
      throw new Error(`Insufficient stock for product ${line.id}`);
    }
    await db.runAsync(
      'UPDATE products SET stock = stock - ?, updated_at = datetime(\'now\') WHERE id = ?',
      line.qty, line.id
    );
  }
}

async function incrementStocksForLines(items) {
  for (const line of items) {
    await db.runAsync(
      'UPDATE products SET stock = stock + ?, updated_at = datetime(\'now\') WHERE id = ?',
      line.qty, line.id
    );
  }
}

/**
 * Full totals for COD / payment — same rules as POST /api/orders
 */
async function computeTotalsFromRequestBody(body) {
  const raw = normalizeCartPayload(body.items);
  const resolved = await resolveOrderLines(raw);
  if (!resolved.ok) return resolved;

  const { items, subtotal } = resolved;
  const deliveryFee = 0;
  const discount = body.promoCode === 'MASAARNA10'
    ? Math.round(subtotal * 0.1 * 100) / 100
    : 0;
  const total = Math.round((subtotal + deliveryFee - discount) * 100) / 100;

  if (!subtotalsMatch(body.clientSubtotal, subtotal)) {
    return {
      ok: false,
      error: 'Order total mismatch. Refresh and try again.',
      serverSubtotal: subtotal
    };
  }

  if (total < MIN_ORDER_AED) {
    return {
      ok: false,
      error: `Minimum order is AED ${MIN_ORDER_AED.toFixed(2)} (after discounts).`
    };
  }

  return { ok: true, items, subtotal, discount, total, deliveryFee };
}

function getMinOrderAed() {
  return MIN_ORDER_AED;
}

module.exports = {
  resolveOrderLines,
  subtotalsMatch,
  normalizeCartPayload,
  decrementStocksForLines,
  incrementStocksForLines,
  computeTotalsFromRequestBody,
  getMinOrderAed
};
