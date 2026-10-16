// Shopfluence – hiring applications (applicant side)
const mongoose = require('mongoose');
const Application = require('../models/Application');
const Company = require('../models/Company');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');
const { removeCvFile, hasValidCvSignature } = require('../middlewares/upload');

// POST /api/applications/apply  (multipart/form-data)
//   fields: companyId, type?, email, phone, fullName?, message?   file: cv (pdf/doc/docx, max 5 MB)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9][0-9\s\-()]{6,22}$/;

exports.apply = asyncHandler(async (req, res) => {
  const file = req.file;
  try {
    const b = req.body || {};
    const { companyId } = b;
    const type = b.type || req.user.role;
    const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
    const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
    const errors = [];
    if (!mongoose.isValidObjectId(companyId)) errors.push({ field: 'companyId', message: 'A valid companyId is required' });
    if (!['manager', 'salesman'].includes(type) || type !== req.user.role) errors.push({ field: 'type', message: `type must be "${req.user.role}" for your account` });
    if (!EMAIL_RE.test(email)) errors.push({ field: 'email', message: 'A valid email is required' });
    if (!PHONE_RE.test(phone)) errors.push({ field: 'phone', message: 'A valid phone number is required' });
    if (!file) errors.push({ field: 'cv', message: 'Please upload your CV (PDF, DOC or DOCX)' });
    else if (!hasValidCvSignature(file.path, file.originalname)) errors.push({ field: 'cv', message: 'The CV file looks corrupted or is not a real PDF/DOC/DOCX' });
    if (errors.length) throw ApiError.unprocessable('Validation failed', errors);

    if (req.user.isHired) throw ApiError.conflict('You are already hired by a store');
    const company = await Company.findById(companyId);
    if (!company) throw ApiError.notFound('Store not found');
    if (!company.isHiring) throw ApiError.conflict('This store is not hiring right now');
    const open = await Application.exists({ applicant: req.user._id, company: company._id, status: { $in: ['pending', 'interview_scheduled'] } });
    if (open) throw ApiError.conflict('You already have an open application with this store');

    const application = await Application.create({
      applicant: req.user._id, company: company._id, type,
      fullName: typeof b.fullName === 'string' ? b.fullName.trim().slice(0, 80) : req.user.name,
      email, phone,
      message: typeof b.message === 'string' ? b.message.trim().slice(0, 1000) : undefined,
      cv: { filename: file.filename, originalName: String(file.originalname || 'cv').slice(0, 200), mimeType: file.mimetype || 'application/octet-stream', size: file.size },
    });
    res.status(201).json({ application });
  } catch (e) {
    if (file) removeCvFile(file.filename);
    throw e;
  }
});

// GET /api/applications/mine
exports.mine = asyncHandler(async (req, res) => {
  const applications = await Application.find({ applicant: req.user._id }).sort({ createdAt: -1 }).populate('company', 'name logo');
  res.json({ applications });
});
