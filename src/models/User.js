'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  AGENT: 'agent',
};

const APPROVAL_STATUS = {
  PENDING:  'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.AGENT,
    },
    publisher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Publisher',
      required: function () {
        return this.role !== ROLES.SUPER_ADMIN;
      },
    },
    isActive: { type: Boolean, default: true },

    // Self-registered users start 'pending' and must be approved by a super_admin
    // before they can log in. Admin-created users and existing accounts are
    // 'approved' (default) so behaviour is unchanged for them.
    approvalStatus: {
      type:    String,
      enum:    Object.values(APPROVAL_STATUS),
      default: APPROVAL_STATUS.APPROVED,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },

    refreshToken: { type: String, select: false },
    lastLogin: { type: Date },
    passwordChangedAt: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });
userSchema.index({ publisher: 1, role: 1 });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    const changedAt = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtTimestamp < changedAt;
  }
  return false;
};

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.APPROVAL_STATUS = APPROVAL_STATUS;
