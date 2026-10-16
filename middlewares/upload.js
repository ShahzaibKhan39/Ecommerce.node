// Shopfluence – image uploads (multer disk storage, 5 MB, images only)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ApiError } = require('./errorHandler');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${ALLOWED[file.mimetype] || ''}`),
});

const fileFilter = (req, file, cb) => {
  if (!ALLOWED[file.mimetype]) {
    return cb(ApiError.badRequest('Only png, jpg, webp, gif and avif images are allowed'));
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/** Public URL for a stored file */
const toUrl = (file) => `/uploads/${file.filename}`;

/** Delete a previously uploaded file by its /uploads/<name> URL. Never throws; ignores external URLs. */
function removeUploadedUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('/uploads/')) return;
  const name = path.basename(url);
  const full = path.join(UPLOAD_DIR, name);
  if (!full.startsWith(UPLOAD_DIR)) return;
  fs.unlink(full, () => {});
}

/** Delete files multer already wrote (used when validation fails after upload). */
function removeUploadedFiles(files) {
  (files || []).forEach((f) => f && f.path && fs.unlink(f.path, () => {}));
}

// ---- CV uploads: stored OUTSIDE /uploads so they are never publicly served; downloaded via an authenticated route
const CV_DIR = path.join(__dirname, '..', 'private-uploads', 'cv');
fs.mkdirSync(CV_DIR, { recursive: true });
const CV_EXT = ['.pdf', '.doc', '.docx'];
const extOf = (name) => path.extname(String(name || '')).toLowerCase();
const uploadCvRaw = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CV_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${extOf(file.originalname)}`),
  }),
  // Judge by extension: browsers/OSes often send "application/octet-stream" or an empty type for .doc/.docx.
  // The real content is verified by magic bytes in the controller (see hasValidCvSignature).
  fileFilter: (req, file, cb) => (CV_EXT.includes(extOf(file.originalname)) ? cb(null, true) : cb(ApiError.badRequest('CV must be a PDF, DOC or DOCX file'))),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

/**
 * Single "cv" upload. When multer rejects a file (too big / wrong type) it stops reading, and answering while
 * the browser is still sending makes the connection reset (ERR_CONNECTION_ABORTED). So drain the request first,
 * then report the error normally.
 */
const uploadCv = {
  single: (field = 'cv') => (req, res, next) => uploadCvRaw.single(field)(req, res, (err) => {
    if (!err) return next();
    if (req.complete || req.readableEnded) return next(err);
    let drained = 0;
    const MAX_DRAIN = 60 * 1024 * 1024; // refuse to soak up absurdly large bodies
    const done = () => { clearTimeout(timer); next(err); };
    const timer = setTimeout(done, 15000);
    req.on('data', (c) => { drained += c.length; if (drained > MAX_DRAIN) { req.removeAllListeners('data'); req.destroy(); } });
    req.once('end', done);
    req.once('error', done);
    req.resume();
  }),
};

/** True when the file really is a PDF / Word document (checks the first bytes, not the name). */
function hasValidCvSignature(filePath, originalName) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(8);
    fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    const ext = extOf(originalName);
    if (ext === '.pdf') return buf.slice(0, 4).toString('latin1') === '%PDF';
    if (ext === '.docx') return buf[0] === 0x50 && buf[1] === 0x4b; // zip container "PK"
    if (ext === '.doc') return buf.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) || buf.slice(0, 2).toString('latin1') === '{\\'; // OLE2 or RTF
    return false;
  } catch (e) { return false; }
}
/** Delete a stored CV by its file name. Never throws. */
function removeCvFile(name) {
  if (typeof name !== 'string' || !name) return;
  const full = path.join(CV_DIR, path.basename(name));
  if (full.startsWith(CV_DIR)) fs.unlink(full, () => {});
}

module.exports = { upload, uploadCv, hasValidCvSignature, removeCvFile, CV_DIR, toUrl, removeUploadedUrl, removeUploadedFiles, UPLOAD_DIR };
