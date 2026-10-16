// Shopfluence – messaging between members of the same company
// (company owner, hired managers and salesmen of that company)
const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Company = require('../models/Company');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');

const isId = (v) => mongoose.isValidObjectId(v);

/** The company a user currently belongs to (owner or hired staff), or null. */
async function companyOf(user) {
  if (user.role === 'company') {
    const c = await Company.findOne({ owner: user._id }).select('_id');
    return c ? c._id : null;
  }
  if (['manager', 'salesman'].includes(user.role) && user.isHired && user.assignedCompany) return user.assignedCompany;
  return null;
}

async function isMemberOf(userId, companyId) {
  const u = await User.findById(userId);
  if (!u || u.isBlocked) return false;
  const c = await companyOf(u);
  return !!c && String(c) === String(companyId);
}

const publicUser = (u) => u && ({ id: String(u._id), name: u.name, role: u.role, uniqueSailorId: u.uniqueSailorId });

// GET /api/messages/contacts – people I can message
exports.contacts = asyncHandler(async (req, res) => {
  const companyId = await companyOf(req.user);
  if (!companyId) throw ApiError.forbidden('You are not part of a store yet');
  const company = await Company.findById(companyId);
  const staff = await User.find({ assignedCompany: companyId, isHired: true, role: { $in: ['manager', 'salesman'] }, _id: { $ne: req.user._id } });
  const owner = String(company.owner) === String(req.user._id) ? null : await User.findById(company.owner);
  res.json({ company: { id: String(company._id), name: company.name }, contacts: [owner, ...staff].filter(Boolean).map(publicUser) });
});

// POST /api/messages/conversations {recipientId} – start (or fetch) a conversation
exports.start = asyncHandler(async (req, res) => {
  const { recipientId } = req.body || {};
  if (!isId(recipientId)) throw ApiError.unprocessable('Validation failed', [{ field: 'recipientId', message: 'A valid recipientId is required' }]);
  if (String(recipientId) === String(req.user._id)) throw ApiError.badRequest('You cannot message yourself');
  const companyId = await companyOf(req.user);
  if (!companyId) throw ApiError.forbidden('You are not part of a store yet');
  if (!(await isMemberOf(recipientId, companyId))) throw ApiError.forbidden('You can only message people in your own store');
  const key = Conversation.keyFor(req.user._id, recipientId);
  let convo = await Conversation.findOne({ company: companyId, participantKey: key });
  let created = false;
  if (!convo) {
    try {
      convo = await Conversation.create({ company: companyId, participants: [req.user._id, recipientId], participantKey: key });
      created = true;
    } catch (e) {
      if (e.code !== 11000) throw e;
      convo = await Conversation.findOne({ company: companyId, participantKey: key });
    }
  }
  res.status(created ? 201 : 200).json({ conversation: convo });
});

// GET /api/messages/conversations
exports.conversations = asyncHandler(async (req, res) => {
  const companyId = await companyOf(req.user);
  if (!companyId) return res.json({ conversations: [] });
  const convos = await Conversation.find({ company: companyId, participants: req.user._id })
    .sort({ lastMessageAt: -1 }).populate('participants', 'name role uniqueSailorId');
  const unread = await Message.aggregate([
    { $match: { conversation: { $in: convos.map((c) => c._id) }, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } } },
    { $group: { _id: '$conversation', n: { $sum: 1 } } },
  ]);
  const um = new Map(unread.map((r) => [String(r._id), r.n]));
  res.json({
    conversations: convos.map((c) => ({
      id: String(c._id),
      company: String(c.company),
      with: publicUser(c.participants.find((p) => String(p._id) !== String(req.user._id))),
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: um.get(String(c._id)) || 0,
    })),
  });
});

/** Loads a conversation and verifies both the caller and the other participant are still in its company. */
async function loadAuthorised(req) {
  if (!isId(req.params.conversationId)) throw ApiError.badRequest('Invalid conversation id');
  const convo = await Conversation.findById(req.params.conversationId);
  if (!convo || !convo.participants.some((p) => String(p) === String(req.user._id))) throw ApiError.notFound('Conversation not found');
  const myCompany = await companyOf(req.user);
  if (!myCompany || String(myCompany) !== String(convo.company)) throw ApiError.forbidden('You are no longer part of this store');
  const other = convo.participants.find((p) => String(p) !== String(req.user._id));
  if (!(await isMemberOf(other, convo.company))) throw ApiError.forbidden('The other participant is no longer part of this store');
  return convo;
}

// GET /api/messages/:conversationId?before=<messageId>&limit=
exports.getMessages = asyncHandler(async (req, res) => {
  const convo = await loadAuthorised(req);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const filter = { conversation: convo._id };
  if (req.query.before) {
    if (!isId(req.query.before)) throw ApiError.badRequest('Invalid before id');
    filter._id = { $lt: req.query.before };
  }
  const messages = (await Message.find(filter).sort({ _id: -1 }).limit(limit)).reverse();
  await Message.updateMany({ conversation: convo._id, sender: { $ne: req.user._id }, readBy: { $ne: req.user._id } }, { $addToSet: { readBy: req.user._id } });
  res.json({ conversation: convo, messages });
});

// POST /api/messages/:conversationId {body}
exports.send = asyncHandler(async (req, res) => {
  const convo = await loadAuthorised(req);
  const body = typeof (req.body || {}).body === 'string' ? req.body.body.trim() : '';
  if (!body || body.length > 2000) throw ApiError.unprocessable('Validation failed', [{ field: 'body', message: 'Message must be 1-2000 characters' }]);
  const message = await Message.create({ conversation: convo._id, sender: req.user._id, body, readBy: [req.user._id] });
  convo.lastMessage = body.slice(0, 200);
  convo.lastMessageAt = message.createdAt;
  convo.lastSender = req.user._id;
  await convo.save();
  res.status(201).json({ message });
});
