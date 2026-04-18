'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const db = require('../config/db');
const ngenius = require('../config/ngenius');
const { placeOrder, deleteOrderAndRestock } = require('../services/placeOrder');

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many payment attempts' }
});

/**
 * Creates a pending card order, opens nGenius Hosted Payment Page.
 * Body matches POST /api/orders (items, clientSubtotal, promoCode, customer, deliveryAddress).
 */
router.post('/create-order', paymentLimiter, async (req, res) => {
  try {
    const out = await placeOrder(req.body, {
      paymentMethod: 'card',
      paymentStatus: 'pending',
      orderStatus: 'pending_payment'
    });
    if (!out.ok) {
      return res.status(400).json({
        error: out.error,
        ...(out.serverSubtotal != null ? { serverSubtotal: out.serverSubtotal } : {})
      });
    }

    const session = await ngenius.createHostedPaymentSession(out.total, 'AED', out.orderNumber, {
      email: req.body.customer && req.body.customer.email,
      redirectPath: `/payment/callback?order=${encodeURIComponent(out.orderNumber)}`
    });

    if (!session.ok || !session.paymentUrl) {
      await deleteOrderAndRestock(out.orderNumber, out.lineItems);
      return res.status(503).json({
        error: session.error || 'Payment gateway not configured',
        hint: 'Set NGENIUS_API_KEY, NGENIUS_OUTLET_ID, PUBLIC_BASE_URL in .env',
        validatedTotal: out.total
      });
    }

    try {
      await db.runAsync(
        'UPDATE orders SET ngenius_order_ref = ?, updated_at = datetime(\'now\') WHERE order_number = ?',
        session.outletOrderReference || session.orderRef || null,
        out.orderNumber
      );
    } catch (e) {
      console.error(e);
    }

    res.json({
      paymentUrl: session.paymentUrl,
      orderRef: session.orderRef || out.orderNumber,
      orderNumber: out.orderNumber,
      amount: out.total
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Payment init failed' });
  }
});

router.post('/verify', (req, res) => {
  res.json({ ok: true, message: 'Verify via nGenius dashboard / webhooks in production' });
});

module.exports = router;
