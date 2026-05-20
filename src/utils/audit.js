'use strict';

const AuditLog = require('../models/AuditLog');

const audit = async ({ user, publisher, action, resource, resourceId, changes, req, success = true, errorMessage }) => {
  try {
    await AuditLog.create({
      user: user?._id || user,
      publisher: publisher?._id || publisher,
      action,
      resource,
      resourceId,
      changes,
      ipAddress: req?.ip,
      userAgent: req?.headers?.['user-agent'],
      success,
      errorMessage,
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

module.exports = audit;
