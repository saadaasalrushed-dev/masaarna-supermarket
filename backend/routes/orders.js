/**
 * Orders — validated totals + stock (see services/orderLines.js)
 */

'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { placeOrder } = require('../services/placeOrder');
const { authenticateAdmin } = require('../middleware/adminAuth');

router.post('/', async (req, res) => {
  const out = await placeOrder(req.body, {
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    orderStatus: 'confirmed'
  });
  if (!out.ok) {
    return res.status(400).json({
      error: out.error,
      ...(out.serverSubtotal != null ? { serverSubtotal: out.serverSubtotal } : {})
    });
  }

  res.status(201).json({
    success: true,
    orderNumber: out.orderNumber,
    total: out.total,
    message: 'Order placed successfully!'
  });
});

/** Order list for staff: GET /api/admin/orders */

router.get('/:ref', async (req, res) => {
  try {
    const order = await db.getAsync('SELECT * FROM orders WHERE order_number = ?', req.params.ref);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json({
      ...order,
      items: JSON.parse(order.items || '[]'),
      delivery_address: JSON.parse(order.delivery_address || '{}')
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:ref/status', authenticateAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = [
    'pending', 'pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  ];

  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    await db.runAsync('UPDATE orders SET status=?, updated_at=datetime(\'now\') WHERE order_number=?',
      status, req.params.ref);
    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticateAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'completed'];

  if (status && !allowed.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    if (status) {
      await db.runAsync('UPDATE orders SET status=?, updated_at=datetime(\'now\') WHERE id=?',
        status, id);
    }
    const order = await db.getAsync('SELECT * FROM orders WHERE id = ?', id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
