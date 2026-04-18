'use strict';

const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * Public site configuration (CMS-driven). Used by storefront for branding & links.
 */
router.get('/site', async (_req, res) => {
  try {
    const rows = await db.allAsync(`
      SELECT "key", value FROM settings
      WHERE "key" LIKE 'site.%' OR "key" LIKE 'social.%' OR "key" LIKE 'contact.%'
    `);
    const flat = {};
    for (const r of rows) {
      const k = r.key != null ? r.key : r.Key;
      if (k) flat[k] = r.value != null ? r.value : r.Value;
    }

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');

    res.json({
      siteName: flat['site.name'] || 'Masaarna Supermarket',
      tagline: flat['site.tagline'] || 'Trust & Heritage',
      logoUrl: flat['site.logo_url'] || '/assets/brand/logo.svg',
      social: {
        whatsapp: flat['social.whatsapp'] || '',
        instagram: flat['social.instagram'] || '',
        tiktok: flat['social.tiktok'] || '',
        facebook: flat['social.facebook'] || '',
        googleReview: flat['social.google_review'] || ''
      },
      contact: {
        phone: flat['contact.phone'] || '',
        email: flat['contact.email'] || '',
        mapEmbedUrl: flat['contact.map_embed_url'] || '',
        mapLinkUrl: flat['contact.map_link_url'] || ''
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Active homepage banners (public, for carousel). */
router.get('/banners', async (_req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT id, title, image_url, link_url, sort_order FROM banners WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    );
    res.json({ banners: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
