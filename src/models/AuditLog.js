'use strict';

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    publisher: { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher' },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    changes: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    success: { type: Boolean, default: true },
    errorMessage: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ publisher: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
