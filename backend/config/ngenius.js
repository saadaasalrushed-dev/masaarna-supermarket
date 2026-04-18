'use strict';

/**
 * Network International — N-Genius Online (Hosted Payment Page)
 * Docs: https://docs.ngenius-payments.com/reference/hosted-payment-page
 *       https://docs.ngenius-payments.com/reference/create-an-order-paypage
 *       https://docs.ngenius-payments.com/docs/obtain-an-access-token
 */

const axios = require('axios');

const BASE = (process.env.NGENIUS_BASE_URL || 'https://api-gateway.sandbox.ngenius-payments.com').replace(/\/$/, '');
const API_KEY = process.env.NGENIUS_API_KEY || '';
const OUTLET = process.env.NGENIUS_OUTLET_ID || '';
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const HDR_IDENTITY = { 'Content-Type': 'application/vnd.ni-identity.v1+json' };
const HDR_PAYMENT = {
  'Content-Type': 'application/vnd.ni-payment.v2+json',
  Accept: 'application/vnd.ni-payment.v2+json'
};

/**
 * @param {number} amountAed - decimal AED (e.g. 24.5)
 * @param {string} currency - ISO currency
 * @param {string} merchantReference - your order reference
 * @param {{ email?: string, redirectPath?: string }} [opts]
 */
async function createHostedPaymentSession(amountAed, currency, merchantReference, opts = {}) {
  if (!API_KEY || !OUTLET) {
    return { ok: false, error: 'nGenius not configured (NGENIUS_API_KEY, NGENIUS_OUTLET_ID)', paymentUrl: null };
  }

  const amountMinor = Math.round(Number(amountAed) * 100);
  if (!Number.isFinite(amountMinor) || amountMinor < 1) {
    return { ok: false, error: 'Invalid amount', paymentUrl: null };
  }

  const redirectUrl = `${PUBLIC_BASE}${opts.redirectPath || '/payment/callback'}`;

  try {
    const tokenRes = await axios.post(`${BASE}/identity/auth/access-token`, {}, {
      headers: { ...HDR_IDENTITY, Authorization: `Basic ${API_KEY}` }
    });
    const access = tokenRes.data && tokenRes.data.access_token;
    if (!access) {
      return { ok: false, error: 'No access_token from nGenius identity', paymentUrl: null };
    }

    const orderBody = {
      action: process.env.NGENIUS_ORDER_ACTION || 'PURCHASE',
      amount: { currencyCode: currency || 'AED', value: amountMinor },
      merchantAttributes: {
        redirectUrl,
        skipConfirmationPage: process.env.NGENIUS_SKIP_CONFIRM === '1',
        skipPaymentMethodSelection: process.env.NGENIUS_SKIP_PM === '1'
      },
      merchantOrderReference: String(merchantReference).slice(0, 128)
    };

    if (opts.email) {
      orderBody.emailAddress = opts.email;
    }

    const orderRes = await axios.post(
      `${BASE}/transactions/outlets/${OUTLET}/orders`,
      orderBody,
      { headers: { ...HDR_PAYMENT, Authorization: `Bearer ${access}` } }
    );

    const data = orderRes.data || {};
    const payUrl =
      data._links?.payment?.href ||
      data._links?.['cnp:payment-link']?.href ||
      '';

    const orderRef = data.reference || data.orderReference || merchantReference;

    if (!payUrl) {
      console.error('nGenius order response missing payment URL', JSON.stringify(data).slice(0, 500));
      return { ok: false, error: 'No payment URL in nGenius response', paymentUrl: null, raw: data };
    }

    return {
      ok: true,
      paymentUrl: String(payUrl).replace(/^http:\/\//i, 'https://'),
      orderRef,
      outletOrderReference: data.reference
    };
  } catch (e) {
    const detail = e.response && e.response.data;
    console.error('nGenius error:', detail || e.message);
    return {
      ok: false,
      error: (detail && (detail.errorMessage || detail.message)) || e.message,
      paymentUrl: null
    };
  }
}

module.exports = { createHostedPaymentSession, BASE };
