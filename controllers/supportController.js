// Shopfluence – support portal (users) and Shopfluence Management ticket handling
const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');

const TYPES = ['problem', 'feedback'];
const STATUSES = ['open', 'in_progress', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high'];
const RAISER_ROLES = ['buyer', 'company', 'manager', 'salesman'];
const isId = (v) => mongoose.isValidObjectId(v);

const populateTicket = (q) => q.populate('raisedBy', 'name email role').populate('replies.author', 'name role');

// ---------- users ----------
// POST /api/support {type, subject, message, priority?}
exports.create = asyncHandler(async (req, res) => {
  const { type, subject, message, priority } = req.body || {};
  const errors = [];
  if (!TYPES.includes(type)) errors.push({ field: 'type', message: `type must be one of: ${TYPES.join(', ')}` });
  if (priority !== undefined && !PRIORITIES.includes(priority)) errors.push({ field: 'priority', message: `priority must be one of: ${PRIORITIES.join(', ')}` });
  if (errors.length) throw ApiError.unprocessable('Validation failed', errors);
  const ticket = await SupportTicket.create({
    type, subject, message, priority: priority || 'normal',
    raisedBy: req.user._id, raisedByRole: req.user.role,
  });
  res.status(201).json({ ticket, message: 'Thanks – Shopfluence support will get back to you' });
});

// GET /api/support/mine
exports.mine = asyncHandler(async (req, res) => {
  const tickets = await populateTicket(SupportTicket.find({ raisedBy: req.user._id }).sort({ updatedAt: -1 }));
  res.json({ tickets });
});

// GET /api/support/:id (own tickets)
exports.getMine = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid ticket id');
  const ticket = await populateTicket(SupportTicket.findOne({ _id: req.params.id, raisedBy: req.user._id }));
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json({ ticket });
});

// POST /api/support/:id/reply {message}  (the user follows up on their own open ticket)
exports.replyMine = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid ticket id');
  const message = typeof (req.body || {}).message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 3000) throw ApiError.unprocessable('Validation failed', [{ field: 'message', message: 'message must be 1-3000 characters' }]);
  const ticket = await SupportTicket.findOneAndUpdate(
    { _id: req.params.id, raisedBy: req.user._id, status: { $ne: 'closed' } },
    { $push: { replies: { author: req.user._id, authorRole: req.user.role, message } }, $set: { status: 'open' } },
    { new: true }
  );
  if (!ticket) throw ApiError.notFound('Open ticket not found');
  res.json({ ticket });
});

// ---------- Shopfluence Management ----------
// GET /api/shopfluence/support?role=&status=&priority=&type=&q=&page=&limit=
exports.adminList = asyncHandler(async (req, res) => {
  const { role, status, priority, type, q } = req.query;
  const filter = {};
  if (role) { if (!RAISER_ROLES.includes(role)) throw ApiError.badRequest(`role must be one of: ${RAISER_ROLES.join(', ')}`); filter.raisedByRole = role; }
  if (status) { if (!STATUSES.includes(status)) throw ApiError.badRequest(`status must be one of: ${STATUSES.join(', ')}`); filter.status = status; }
  if (priority) { if (!PRIORITIES.includes(priority)) throw ApiError.badRequest(`priority must be one of: ${PRIORITIES.join(', ')}`); filter.priority = priority; }
  if (type) { if (!TYPES.includes(type)) throw ApiError.badRequest(`type must be one of: ${TYPES.join(', ')}`); filter.type = type; }
  if (q && String(q).trim()) filter.subject = { $regex: String(q).trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const [tickets, total] = await Promise.all([
    populateTicket(SupportTicket.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)),
    SupportTicket.countDocuments(filter),
  ]);
  res.json({ tickets, total, page, pages: Math.ceil(total / limit) || 1 });
});

// GET /api/shopfluence/support/:id
exports.adminGet = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid ticket id');
  const ticket = await populateTicket(SupportTicket.findById(req.params.id));
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json({ ticket });
});

// POST /api/shopfluence/support/:id/reply {message, status?}
exports.adminReply = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid ticket id');
  const { message, status } = req.body || {};
  const text = typeof message === 'string' ? message.trim() : '';
  if (!text || text.length > 3000) throw ApiError.unprocessable('Validation failed', [{ field: 'message', message: 'message must be 1-3000 characters' }]);
  if (status !== undefined && !STATUSES.includes(status)) throw ApiError.unprocessable('Validation failed', [{ field: 'status', message: `status must be one of: ${STATUSES.join(', ')}` }]);
  const ticket = await SupportTicket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Ticket not found');
  ticket.replies.push({ author: req.user._id, authorRole: req.user.role, message: text });
  ticket.status = status || (ticket.status === 'open' ? 'in_progress' : ticket.status);
  await ticket.save();
  res.json({ ticket: await populateTicket(SupportTicket.findById(ticket._id)) });
});

// PATCH /api/shopfluence/support/:id {status?, priority?}
exports.adminUpdate = asyncHandler(async (req, res) => {
  if (!isId(req.params.id)) throw ApiError.badRequest('Invalid ticket id');
  const { status, priority } = req.body || {};
  const errors = [];
  if (status !== undefined && !STATUSES.includes(status)) errors.push({ field: 'status', message: `status must be one of: ${STATUSES.join(', ')}` });
  if (priority !== undefined && !PRIORITIES.includes(priority)) errors.push({ field: 'priority', message: `priority must be one of: ${PRIORITIES.join(', ')}` });
  if (status === undefined && priority === undefined) errors.push({ field: 'status', message: 'Provide status and/or priority' });
  if (errors.length) throw ApiError.unprocessable('Validation failed', errors);
  const set = {};
  if (status) set.status = status;
  if (priority) set.priority = priority;
  const ticket = await populateTicket(SupportTicket.findByIdAndUpdate(req.params.id, { $set: set }, { new: true }));
  if (!ticket) throw ApiError.notFound('Ticket not found');
  res.json({ ticket });
});
