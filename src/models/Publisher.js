'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const publisherSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    apiKey: { type: String, unique: true, default: () => `ak_${uuidv4().replace(/-/g, '')}` },
    isActive: { type: Boolean, default: true },
    contactEmail: { type: String, required: true, lowercase: true },
    contactphone: { type: String },
    ipWhitelist: [{ type: String }],
    notes: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

publisherSchema.index({ apiKey: 1 });
publisherSchema.index({ slug: 1 });

publisherSchema.methods.toSafeJSON = function () {
  const obj = this.toObject();
  obj.apiKey = obj.apiKey.slice(0, 6) + '••••••' + obj.apiKey.slice(-4);
  return obj;
};

module.exports = mongoose.model('Publisher', publisherSchema);
