// Shopfluence – User model
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ROLE_VALUES = ['buyer', 'company', 'manager', 'salesman', 'shopfluence_management'];
const SAIL_RE = /^SAIL-[A-Z0-9]{6}$/;
const SAIL_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomSailorId() {
  const bytes = crypto.randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += SAIL_ALPHABET[bytes[i] % SAIL_ALPHABET.length];
  return `SAIL-${s}`;
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String, required: [true, 'Email is required'], unique: true, lowercase: true, trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email'],
    },
    password: { type: String, required: true, minlength: [8, 'Password must be at least 8 characters'], select: false },
    role: { type: String, enum: ROLE_VALUES, required: true, default: 'buyer' },
    phone: { type: String, trim: true, maxlength: 30 },
    avatar: { type: String },
    status: { type: String, enum: ['active', 'unassigned'], default: 'active' },
    isHired: { type: Boolean, default: false },
    assignedCompany: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uniqueSailorId: { type: String, match: SAIL_RE, unique: true, sparse: true },
    isBlocked: { type: Boolean, default: false },
    mustChangePassword: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

userSchema.pre('validate', async function genSailorId(next) {
  if (this.role === 'salesman' && !this.uniqueSailorId) {
    for (let i = 0; i < 10; i++) {
      const candidate = randomSailorId();
      // eslint-disable-next-line no-await-in-loop
      if (!(await this.constructor.exists({ uniqueSailorId: candidate }))) {
        this.uniqueSailorId = candidate;
        break;
      }
    }
  }
  next();
});

userSchema.pre('save', async function hash(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function comparePassword(plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    role: this.role,
    roleLabel: this.role === 'shopfluence_management' ? 'Shopfluence Management' : undefined,
    phone: this.phone,
    avatar: this.avatar,
    status: this.status,
    isHired: this.isHired,
    assignedCompany: this.assignedCompany ? String(this.assignedCompany._id || this.assignedCompany) : null,
    assignedManager: this.assignedManager ? String(this.assignedManager._id || this.assignedManager) : null,
    uniqueSailorId: this.uniqueSailorId,
    mustChangePassword: this.mustChangePassword || undefined,
    createdAt: this.createdAt,
  };
};

userSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.SAIL_RE = SAIL_RE;
module.exports.ROLE_VALUES = ROLE_VALUES;
