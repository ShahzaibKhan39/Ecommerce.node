// Shopfluence – shared helpers for hired staff (managers and salesmen)
const crypto = require('crypto');
const User = require('../models/User');
const { ApiError } = require('../middlewares/errorHandler');

const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
function generatePassword(len = 12) {
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, (b) => PW_ALPHABET[b % PW_ALPHABET.length]).join('');
}

/** Release a manager/salesman from their company; the account itself is kept. */
async function releaseStaff(user) {
  user.isHired = false;
  user.assignedCompany = null;
  user.assignedManager = null;
  user.status = 'unassigned';
  await user.save();
  return user;
}

/**
 * Directly adds a manager or salesman to a store (no application / interview).
 * Returns { user, credentials } – the generated password is shown once and the person must change it at first login.
 */
async function createStaffMember({ role, body, companyId, managerId = null, createdBy }) {
  const b = body || {};
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const errors = [];
  if (name.length < 2) errors.push({ field: 'name', message: 'Name is required' });
  if (!email) errors.push({ field: 'email', message: 'Email is required' });
  if (b.password !== undefined && b.password !== '' && (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 72)) {
    errors.push({ field: 'password', message: 'Password must be 8-72 characters' });
  }
  if (errors.length) throw ApiError.unprocessable('Validation failed', errors);
  if (await User.exists({ email })) throw ApiError.conflict('An account with this email already exists');

  const password = b.password || generatePassword();
  const user = await User.create({
    name, email, password, role,
    phone: typeof b.phone === 'string' && b.phone.trim() ? b.phone.trim() : undefined,
    isHired: true, status: 'active', assignedCompany: companyId, assignedManager: managerId,
    createdBy, mustChangePassword: true,
  });
  return {
    user,
    credentials: { email, password, uniqueSailorId: user.uniqueSailorId, note: 'Shown only once – share securely. They must change the password at first login.' },
  };
}

module.exports = { releaseStaff, generatePassword, createStaffMember };
