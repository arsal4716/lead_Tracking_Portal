'use strict';

const mongoose = require('mongoose');

// Per-field param key overrides per destination
// e.g. phone field → ringba="callerid", rtb="CID", callgrid="CallerId"
const destinationParamSchema = new mongoose.Schema(
  {
    ringba:   { type: String }, // param name sent to Ringba Regular
    rtb:      { type: String }, // param name sent to Ringba RTB
    callgrid: { type: String }, // param name sent to CallGrid
  },
  { _id: false }
);

const campaignFieldSchema = new mongoose.Schema(
  {
    field:               { type: mongoose.Schema.Types.ObjectId, ref: 'Field', required: true },
    isRequired:          { type: Boolean, default: false },
    order:               { type: Number, default: 0 },
    overrideLabel:       { type: String },
    overridePlaceholder: { type: String },
    overrideDefaultValue: { type: mongoose.Schema.Types.Mixed },
    includeInRingba:     { type: Boolean, default: true },

    // Per-destination param key overrides for this field in this campaign
    // If set, overrides field.ringbaParamKey for that specific destination
    destinationParams:   { type: destinationParamSchema, default: () => ({}) },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true },
    publisher: { type: mongoose.Schema.Types.ObjectId, ref: 'Publisher', required: true },

    // ── Destination routing ────────────────────────────────────────────────────
    destination: {
      type: String,
      enum: [
        'ringba_regular',
        'ringba_rtb',
        'callgrid',
        'ringba_regular_and_callgrid',
        'ringba_rtb_and_callgrid',
      ],
      default: 'ringba_regular',
    },

    // Ringba Regular
    ringbaId: { type: String, trim: true },

    // Ringba RTB — paste full URL or just the key
    ringbaRtbUrl: { type: String, trim: true },

    // CallGrid — paste full example URL
    callgridUrl: { type: String, trim: true },

    // ── Status & compliance ────────────────────────────────────────────────────
    isActive:           { type: Boolean, default: true },
    jornayaEnabled:     { type: Boolean, default: false },
    trustedFormEnabled: { type: Boolean, default: false },
    apiAutofillEnabled: { type: Boolean, default: false },
    apiIntegration:     { type: mongoose.Schema.Types.ObjectId, ref: 'APIIntegrationConfig' },

    fields: [campaignFieldSchema],

    description: { type: String },
    tags:        [{ type: String }],
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

campaignSchema.index({ publisher: 1, isActive: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
