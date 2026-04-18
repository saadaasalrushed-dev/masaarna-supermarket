'use strict';

const db = require('../config/db');
const {
  computeTotalsFromRequestBody,
  decrementStocksForLines,
  incrementStocksForLines
} = require('./orderLines');

function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `MSA-${ts}-${rand}`;
}

/**
 * @param {object} body - same shape as POST /api/orders
 * @param {{ paymentMethod: 'cod'|'card', orderStatus?: string, paymentStatus?: string }} opts
 */
async function placeOrder(body, opts = {}) {
  const paymentMethod = opts.paymentMethod || 'cod';
  const paymentStatus = opts.paymentStatus != null ? opts.paymentStatus : 'pending';
  const orderStatus = opts.orderStatus != null ? opts.orderStatus : 'confirmed';

  const { customer, deliveryAddress } = body;

  const out = await computeTotalsFromRequestBody(body);
  if (!out.ok) {
    return { ok: false, ...out };
  }

  const { items: lineItems, subtotal, discount, total, deliveryFee } = out;

  if (!customer || !customer.firstName || !customer.lastName || !customer.email) {
    return { ok: false, error: 'Customer details required' };
  }

  const orderNumber = generateOrderNumber();

  try {
    await db.runAsync('BEGIN IMMEDIATE');
    await db.runAsync(
      `
      INSERT INTO orders (
        order_number, status, payment_method, payment_status, ngenius_order_ref,
        subtotal, delivery_fee, discount, total, currency,
        customer_name, customer_email, customer_phone, delivery_address, items
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
      orderNumber,
      orderStatus,
      paymentMethod,
      paymentStatus,
      null,
      subtotal,
      deliveryFee,
      discount,
      total,
      'AED',
      `${customer.firstName} ${customer.lastName}`,
      customer.email,
      customer.phone || '',
      JSON.stringify(deliveryAddress || {}),
      JSON.stringify(lineItems)
    );

    await decrementStocksForLines(lineItems);
    await db.runAsync('COMMIT');

    return { ok: true, orderNumber, total, lineItems };
  } catch (err) {
    try {
      await db.runAsync('ROLLBACK');
    } catch (e) {
      /* ignore */
    }
    console.error(err);
    return { ok: false, error: err.message || 'Failed to create order' };
  }
}

async function deleteOrderAndRestock(orderNumber, lineItems) {
  if (!orderNumber || !Array.isArray(lineItems)) return;
  try {
    await db.runAsync('BEGIN IMMEDIATE');
    await incrementStocksForLines(lineItems);
    await db.runAsync('DELETE FROM orders WHERE order_number = ?', orderNumber);
    await db.runAsync('COMMIT');
  } catch (e) {
    try {
      await db.runAsync('ROLLBACK');
    } catch (r) {
      /* ignore */
    }
    console.error('deleteOrderAndRestock:', e);
  }
}

module.exports = { placeOrder, generateOrderNumber, deleteOrderAndRestock };
