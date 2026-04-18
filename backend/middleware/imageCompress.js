'use strict';

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
const PRODUCTS_SUB = 'products';
const QUALITY = parseInt(process.env.IMAGE_QUALITY || '85', 10);
const THUMB_W = parseInt(process.env.IMAGE_THUMB_WIDTH || '480', 10);

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10)) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Invalid file type'), ok);
  }
});

async function processAndSaveProductImage(buffer) {
  const sharp = require('sharp');
  const id = uuidv4();
  const relDir = path.join(PRODUCTS_SUB);
  const dir = path.join(UPLOAD_DIR, relDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const base = `${id}.webp`;
  const thumbBase = `${id}-t.webp`;
  const outPath = path.join(dir, base);
  const thumbPath = path.join(dir, thumbBase);
  await sharp(buffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toFile(outPath);

  await sharp(buffer)
    .resize(THUMB_W, THUMB_W, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Math.min(QUALITY, 82) })
    .toFile(thumbPath);

  const url = `/uploads/${relDir}/${base}`.replace(/\\/g, '/');
  const thumbUrl = `/uploads/${relDir}/${thumbBase}`.replace(/\\/g, '/');
  return { url, thumbUrl, path: outPath };
}

function uploadSingleImage(fieldName) {
  return [
    upload.single(fieldName),
    async (req, res, next) => {
      if (!req.file) return next();
      try {
        req.processedImage = await processAndSaveProductImage(req.file.buffer);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      next();
    }
  ];
}

/** Multiple product photos: field name `images` (maxCount). Sets req.processedImageList. */
function uploadProductImages(maxCount = 12) {
  return [
    upload.array('images', maxCount),
    async (req, res, next) => {
      if (!req.files || !req.files.length) return next();
      try {
        req.processedImageList = [];
        for (const file of req.files) {
          req.processedImageList.push(await processAndSaveProductImage(file.buffer));
        }
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      next();
    }
  ];
}

module.exports = { uploadSingleImage, uploadProductImages, upload };
