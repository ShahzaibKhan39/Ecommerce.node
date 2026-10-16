// Shopfluence – role based access control
const Company = require('../models/Company');
const { ApiError, asyncHandler } = require('./errorHandler');

const ROLES = Object.freeze({
  BUYER: 'buyer',
  COMPANY: 'company',
  MANAGER: 'manager',
  SALESMAN: 'salesman',
  ADMIN: 'shopfluence_management',
});
const SELF_REGISTER_ROLES = [ROLES.BUYER, ROLES.COMPANY, ROLES.MANAGER, ROLES.SALESMAN];
const ROLE_LABELS = {
  buyer: 'Buyer',
  company: 'Store',
  manager: 'Manager',
  salesman: 'Salesman',
  shopfluence_management: 'Shopfluence Management',
};

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(ApiError.forbidden(`Access denied for role "${ROLE_LABELS[req.user.role] || req.user.role}"`));
  }
  next();
};

/** Managers and salesmen must be hired by a company */
const requireHired = (req, res, next) => {
  const u = req.user;
  if (!u) return next(ApiError.unauthorized());
  if (['manager', 'salesman'].includes(u.role) && (!u.isHired || !u.assignedCompany)) {
    return next(ApiError.forbidden('You are not hired by a store yet'));
  }
  next();
};

/** Sets req.companyId for the company owner or a hired manager */
const attachCompanyScope = asyncHandler(async (req, res, next) => {
  const u = req.user;
  if (u.role === 'company') {
    const company = await Company.findOne({ owner: u._id });
    if (!company) throw ApiError.notFound('Create your store profile first');
    req.companyId = company._id;
    req.company = company;
  } else if (u.role === 'manager') {
    if (!u.isHired || !u.assignedCompany) throw ApiError.forbidden('You are not hired by a store yet');
    req.companyId = u.assignedCompany;
  } else {
    throw ApiError.forbidden('Store scope is only available to store owners and hired managers');
  }
  next();
});

module.exports = { authorize, requireHired, attachCompanyScope, ROLES, SELF_REGISTER_ROLES, ROLE_LABELS };
