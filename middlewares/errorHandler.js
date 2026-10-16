// Shopfluence – error handling
const multer = require('multer');
const env = require('../config/env');

class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.isApiError = true;
  }
  static badRequest(msg = 'Bad request', errors) { return new ApiError(400, msg, errors); }
  static unauthorized(msg = 'Authentication required') { return new ApiError(401, msg); }
  static forbidden(msg = 'You do not have permission to do that') { return new ApiError(403, msg); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg); }
  static conflict(msg = 'Conflict', errors) { return new ApiError(409, msg, errors); }
  static unprocessable(msg = 'Validation failed', errors) { return new ApiError(422, msg, errors); }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const notFound = (req, res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Server error';
  let errors = err.errors;

  if (err.name === 'ValidationError' && err.errors && !err.isApiError) {
    status = 422;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || err.keyValue || {});
    message = fields.length ? `Duplicate value for: ${fields.join(', ')}` : 'Duplicate value';
    errors = [{ fields, message }];
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError' || err.name === 'NotBeforeError') {
    status = 401;
    message = err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid authentication token';
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 5 MB)'
      : err.code === 'LIMIT_UNEXPECTED_FILE' ? `Unexpected or too many files (${err.field || 'field'})`
      : err.message;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    console.error('[Shopfluence] Error:', err);
    if (env.isProd) { message = 'Internal server error'; errors = undefined; }
  }

  const body = { message };
  if (errors) body.errors = errors;
  if (!env.isProd && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
};

module.exports = { ApiError, asyncHandler, notFound, errorHandler };
