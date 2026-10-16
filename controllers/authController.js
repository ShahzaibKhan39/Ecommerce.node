// Shopfluence – auth controller
const User = require('../models/User');
const Company = require('../models/Company');
const { ApiError, asyncHandler } = require('../middlewares/errorHandler');
const { setAuthCookie, clearAuthCookie } = require('../middlewares/auth');
const { SELF_REGISTER_ROLES } = require('../middlewares/rbac');

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const name = str(req.body.name);
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const role = str(req.body.role) || 'buyer';
  const errors = [];
  if (!name) errors.push({ field: 'name', message: 'Name is required' });
  if (!email) errors.push({ field: 'email', message: 'Email is required' });
  if (password.length < 8) errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  if (password.length > 72) errors.push({ field: 'password', message: 'Password must be at most 72 characters' });
  if (!SELF_REGISTER_ROLES.includes(role)) {
    errors.push({ field: 'role', message: `Role must be one of: ${SELF_REGISTER_ROLES.join(', ')}` });
  }
  const companyName = str(req.body.companyName);
  if (role === 'company' && companyName.length < 2) errors.push({ field: 'companyName', message: 'Store name is required for store accounts' });
  if (errors.length) throw ApiError.unprocessable('Validation failed', errors);

  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');
  if (role === 'company' && (await Company.exists({ name: companyName }))) throw ApiError.conflict('A store with this name already exists');

  const user = await User.create({
    name, email, password, role,
    phone: str(req.body.phone) || undefined,
    status: ['manager', 'salesman'].includes(role) ? 'unassigned' : 'active',
  });

  if (role === 'company') {
    try {
      await Company.create({ name: companyName, owner: user._id, description: str(req.body.description) });
    } catch (e) {
      await User.deleteOne({ _id: user._id }); // keep user + company creation consistent
      throw e;
    }
  }
  setAuthCookie(res, user._id);
  res.status(201).json({ user: user.toPublic() });
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const email = str(req.body.email).toLowerCase();
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  if (!email || !password) throw ApiError.badRequest('Email and password are required');
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw ApiError.unauthorized('Invalid email or password');
  if (user.isBlocked) throw ApiError.forbidden('This account has been suspended');
  setAuthCookie(res, user._id);
  res.json({ user: user.toPublic() });
});

// POST /api/auth/logout
exports.logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res);
  res.json({ message: 'Logged out of Shopfluence' });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json({ user: req.user.toPublic() });
});

// POST /api/auth/change-password  (used to replace one-time credentials)
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') throw ApiError.badRequest('currentPassword and newPassword are required');
  if (newPassword.length < 8 || newPassword.length > 72) throw ApiError.unprocessable('Validation failed', [{ field: 'newPassword', message: 'Password must be 8-72 characters' }]);
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) throw ApiError.unauthorized('Current password is incorrect');
  user.password = newPassword;
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: 'Password updated', user: user.toPublic() });
});
