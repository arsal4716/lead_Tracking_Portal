'use strict';

const AppError = require('../utils/AppError');

const handleCastErrorDB = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400);
const handleDuplicateFieldsDB = (err) => {
  const field = Object.keys(err.keyValue)[0];
  return new AppError(`Duplicate value for field: ${field}`, 400);
};
const handleValidationErrorDB = (err) => {
  const messages = Object.values(err.errors).map((e) => e.message);
  return new AppError(`Validation error: ${messages.join('. ')}`, 400);
};
const handleJWTError = () => new AppError('Invalid token. Please log in again.', 401);
const handleJWTExpiredError = () => new AppError('Token expired. Please log in again.', 401);

const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

const sendErrorProd = (err, res) => {
  if (err.isOperational) {
    res.status(err.statusCode).json({ status: err.status, message: err.message });
  } else {
    console.error('UNHANDLED ERROR:', err);
    res.status(500).json({ status: 'error', message: 'Something went wrong.' });
  }
};

module.exports = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (process.env.NODE_ENV === 'development') {
    return sendErrorDev(err, res);
  }

  let error = Object.assign(Object.create(Object.getPrototypeOf(err)), err);
  error.message = err.message;

  if (err.name === 'CastError') error = handleCastErrorDB(err);
  if (err.code === 11000) error = handleDuplicateFieldsDB(err);
  if (err.name === 'ValidationError') error = handleValidationErrorDB(err);
  if (err.name === 'JsonWebTokenError') error = handleJWTError();
  if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

  sendErrorProd(error, res);
};
