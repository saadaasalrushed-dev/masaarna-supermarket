'use strict';

const express = require('express');
const router = express.Router();
const { uploadSingleImage } = require('../middleware/imageCompress');
const { authenticateAdmin } = require('../middleware/adminAuth');

router.post('/image', authenticateAdmin, ...uploadSingleImage('image'), (req, res) => {
  if (!req.processedImage) return res.status(400).json({ error: 'No image' });
  res.json({
    url: req.processedImage.url,
    thumbUrl: req.processedImage.thumbUrl || null
  });
});

module.exports = router;
