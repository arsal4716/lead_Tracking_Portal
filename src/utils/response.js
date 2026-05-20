'use strict';

const sendSuccess = (res, data, statusCode = 200, meta = {}) => {
  const response = { status: 'success', data };
  if (Object.keys(meta).length) response.meta = meta;
  return res.status(statusCode).json(response);
};

const sendError = (res, message, statusCode = 400) => {
  return res.status(statusCode).json({ status: 'fail', message });
};

const sendPaginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    status: 'success',
    data,
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      pages: Math.ceil(total / limit),
    },
  });
};

module.exports = { sendSuccess, sendError, sendPaginated };
