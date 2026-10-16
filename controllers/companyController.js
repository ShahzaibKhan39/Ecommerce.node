// Shopfluence – companies (public directory, ratings) and company-owner panel
const mongoose = require('mongoose');
const Company = require('../models/Company');
const Order = require('../models/Order');
const Review = require('../models/Review');
const Application = require('../models/Application');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');
const path = require('path');
const { toUrl, removeUploadedUrl, removeUploadedFiles, CV_DIR } = require('../middlewares/upload');
const { companyAnalytics } = require('../utils/analytics');
const { releaseStaff, createStaffMember } = require('./staffHelpers');

const isId = (v) => mongoose.isValidObjectId(v);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const publicCompany = (c) => ({
  id: String(c._id), name: c.name, description: c.description, logo: c.logo,
  isHiring: c.isHiring, rating: c.rating, ratingCount: c.ratingCount, createdAt: c.createdAt,
});

// ---------- public ----------
// GET /api/companies?hiring=true&sort=rating&q=name&page=&limit=
exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.hiring === 'true') filter.isHiring = true;
  if (req.query.q && String(req.query.q).trim()) filter.name = { $regex: escapeRegex(String(req.query.q).trim().slice(0, 100)), $options: 'i' };
  const sorts = {
    rating: { rating: -1, ratingCount: -1, name: 1 },       // default: top-listed
    reviews: { ratingCount: -1, rating: -1 },
    newest: { createdAt: -1 },
    name: { name: 1 },
  };
  const sort = req.query.sort === undefined ? 'rating' : req.query.sort;
  if (!sorts[sort]) throw ApiError.badRequest(`sort must be one of: ${Object.keys(sorts).join(', ')}`);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(60, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const [companies, total] = await Promise.all([
    Company.find(filter).sort(sorts[sort]).skip((page - 1) * limit).limit(limit),
    Company.countDocuments(filter),
  ]);
  res.json({ companies: companies.map(publicCompany), total, page, pages: Math.ceil(total / limit) || 1, sort });
});

// GET /api/companies/:id
exports.getOne = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid store id');
  const c = await Company.findById(req.params.id);
  if (!c) throw ApiError.notFound('Store not found');
  res.json({ company: publicCompany(c) });
});

// GET /api/companies/:id/reviews
exports.reviews = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid store id');
  const reviews = await Review.find({ company: req.params.id }).sort({ createdAt: -1 }).limit(50).populate('buyer', 'name');
  res.json({ reviews: reviews.map((r) => ({ id: String(r._id), rating: r.rating, comment: r.comment, buyerName: r.buyer && r.buyer.name, createdAt: r.createdAt })) });
});

// POST /api/companies/:id/rate {rating 1-5, comment?}  (buyers with a delivered order only)
exports.rate = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid store id');
  const rating = Number(req.body && req.body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw ApiError.unprocessable('Validation failed', [{ field: 'rating', message: 'rating must be an integer between 1 and 5' }]);
  const comment = req.body.comment === undefined ? undefined : String(req.body.comment).trim().slice(0, 1000);
  const company = await Company.findById(req.params.id);
  if (!company) throw ApiError.notFound('Store not found');
  const delivered = await Order.findOne({ buyer: req.user._id, company: company._id, status: 'delivered' }).sort({ updatedAt: -1 });
  if (!delivered) throw ApiError.forbidden('You can rate a store only after one of your orders from it has been delivered');
  const review = await Review.findOneAndUpdate(
    { company: company._id, buyer: req.user._id },
    { $set: { rating, comment, order: delivered._id } },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
  );
  const stats = await Review.recomputeCompanyRating(company._id);
  res.json({ review, company: { id: String(company._id), ...stats } });
});

// ---------- company owner panel (/api/company) ----------
// GET /api/company/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ company: req.company });
});

// PUT /api/company/me  (multipart: logo)
exports.updateMe = asyncHandler(async (req, res) => {
  const file = req.file;
  try {
    const c = req.company;
    const b = req.body || {};
    if (b.name !== undefined) c.name = b.name;
    if (b.description !== undefined) c.description = b.description;
    if (b.isHiring !== undefined) c.isHiring = b.isHiring === true || b.isHiring === 'true';
    if (b.commissionRate !== undefined && b.commissionRate !== '') c.commissionRate = Number(b.commissionRate);
    let oldLogo;
    if (file) { oldLogo = c.logo; c.logo = toUrl(file); }
    await c.save();
    removeUploadedUrl(oldLogo);
    res.json({ company: c });
  } catch (e) {
    if (file) removeUploadedFiles([file]);
    throw e;
  }
});

// PATCH /api/company/hiring {isHiring}
exports.setHiring = asyncHandler(async (req, res) => {
  if (typeof (req.body || {}).isHiring !== 'boolean') throw ApiError.badRequest('isHiring (boolean) is required');
  req.company.isHiring = req.body.isHiring;
  await req.company.save();
  res.json({ company: req.company });
});

// GET /api/company/applications?status=
exports.listApplications = asyncHandler(async (req, res) => {
  const filter = { company: req.companyId };
  if (req.query.status) filter.status = req.query.status;
  const apps = await Application.find(filter).sort({ createdAt: -1 }).populate('applicant', 'name email phone role');
  res.json({ applications: apps });
});

// GET /api/company/applications/:id/cv  (only the company that received the application)
exports.downloadCv = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid application id');
  const app = await Application.findOne({ _id: req.params.id, company: req.companyId });
  if (!app || !app.cv || !app.cv.filename) throw ApiError.notFound('CV not found');
  const full = path.join(CV_DIR, path.basename(app.cv.filename));
  res.download(full, app.cv.originalName || 'cv', (err) => { if (err && !res.headersSent) res.status(404).json({ message: 'CV file is missing' }); });
});

const NEXT = {
  pending: ['interview_scheduled', 'approved', 'rejected'],
  interview_scheduled: ['approved', 'rejected'],
  approved: [],
  rejected: [],
};

// PUT /api/company/applications/:id {status, interviewAt?, interviewNote?, assignedManagerId?}
exports.reviewApplication = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid application id');
  const { status, interviewAt, interviewNote, assignedManagerId } = req.body || {};
  if (!['interview_scheduled', 'approved', 'rejected'].includes(status)) {
    throw ApiError.unprocessable('Validation failed', [{ field: 'status', message: 'status must be interview_scheduled, approved or rejected' }]);
  }
  const app = await Application.findOne({ _id: req.params.id, company: req.companyId });
  if (!app) throw ApiError.notFound('Application not found');
  if (!NEXT[app.status].includes(status)) throw ApiError.conflict(`Application is ${app.status} and cannot move to ${status}`);

  if (status === 'interview_scheduled') {
    // Only managers are interviewed – salesmen are approved (or added) directly.
    if (app.type !== 'manager') throw ApiError.conflict('Salesmen are hired without an interview – approve or reject the application');
    const d = new Date(interviewAt);
    if (!interviewAt || Number.isNaN(d.getTime())) throw ApiError.unprocessable('Validation failed', [{ field: 'interviewAt', message: 'Choose the interview date and time' }]);
    if (d.getTime() < Date.now() - 60 * 1000) throw ApiError.unprocessable('Validation failed', [{ field: 'interviewAt', message: 'The interview must be in the future' }]);
    app.interviewAt = d;
    if (interviewNote !== undefined) app.interviewNote = String(interviewNote).slice(0, 500);
  }

  if (status === 'approved') {
    const applicant = await User.findById(app.applicant);
    if (!applicant) throw ApiError.notFound('Applicant no longer exists');
    if (applicant.isHired) throw ApiError.conflict('Applicant is already hired by a store');
    if (applicant.role !== app.type) throw ApiError.conflict('Applicant role no longer matches the application');
    let managerId = null;
    if (assignedManagerId) {
      if (app.type !== 'salesman') throw ApiError.unprocessable('Validation failed', [{ field: 'assignedManagerId', message: 'Only salesmen can be assigned a manager' }]);
      if (!isId(assignedManagerId)) throw ApiError.badRequest('Invalid assignedManagerId');
      const mgr = await User.findOne({ _id: assignedManagerId, role: 'manager', isHired: true, assignedCompany: req.companyId });
      if (!mgr) throw ApiError.unprocessable('Validation failed', [{ field: 'assignedManagerId', message: 'Manager must be hired by your store' }]);
      managerId = mgr._id;
    }
    applicant.isHired = true;
    applicant.assignedCompany = req.companyId;
    applicant.assignedManager = managerId;
    applicant.status = 'active';
    await applicant.save();
    app.assignedManager = managerId || undefined;
    // the applicant is taken – close their other open applications
    await Application.updateMany(
      { applicant: applicant._id, _id: { $ne: app._id }, status: { $in: ['pending', 'interview_scheduled'] } },
      { $set: { status: 'rejected', reviewedAt: new Date(), interviewNote: 'Applicant was hired by another company' } }
    );
  }

  app.status = status;
  app.reviewedBy = req.user._id;
  app.reviewedAt = new Date();
  await app.save();
  res.json({ application: app });
});

// GET /api/company/salesmen , /api/company/managers
exports.listSalesmen = asyncHandler(async (req, res) => {
  const users = await User.find({ role: 'salesman', assignedCompany: req.companyId, isHired: true }).sort({ createdAt: -1 });
  res.json({ salesmen: users.map((u) => u.toPublic()) });
});
exports.listManagers = asyncHandler(async (req, res) => {
  const users = await User.find({ role: 'manager', assignedCompany: req.companyId, isHired: true }).sort({ createdAt: -1 });
  res.json({ managers: users.map((u) => u.toPublic()) });
});

// POST /api/company/salesmen {name, email, phone?, password?}  – add a salesman directly (no interview)
exports.createSalesman = asyncHandler(async (req, res) => {
  const { user, credentials } = await createStaffMember({
    role: 'salesman', body: req.body, companyId: req.companyId, managerId: null, createdBy: req.user._id,
  });
  res.status(201).json({ salesman: user.toPublic(), credentials });
});

// POST /api/company/managers {name, email, phone?, password?}  – add a manager directly (instead of an interview)
exports.createManager = asyncHandler(async (req, res) => {
  const { user, credentials } = await createStaffMember({
    role: 'manager', body: req.body, companyId: req.companyId, managerId: null, createdBy: req.user._id,
  });
  res.status(201).json({ manager: user.toPublic(), credentials });
});

// DELETE /api/company/salesmen/:id  (releases the salesman from the company)
exports.removeSalesman = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid salesman id');
  const s = await User.findOne({ _id: req.params.id, role: 'salesman', assignedCompany: req.companyId });
  if (!s) throw ApiError.notFound('Salesman not found in your store');
  await releaseStaff(s);
  res.json({ message: 'Salesman removed from your store', salesman: s.toPublic() });
});

// DELETE /api/company/managers/:id
exports.removeManager = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid manager id');
  const m = await User.findOne({ _id: req.params.id, role: 'manager', assignedCompany: req.companyId });
  if (!m) throw ApiError.notFound('Manager not found in your store');
  await User.updateMany({ assignedManager: m._id }, { $set: { assignedManager: null } });
  await releaseStaff(m);
  res.json({ message: 'Manager removed from your store', manager: m.toPublic() });
});

// GET /api/company/analytics
exports.analytics = asyncHandler(async (req, res) => {
  res.json({ analytics: await companyAnalytics(req.companyId) });
});
