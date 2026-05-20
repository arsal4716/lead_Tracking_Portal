'use strict';

const mongoose = require('mongoose');

// NOTE: 'conditional' is NOT a field type — it rendered blank inputs.
// Conditional behavior is now set via conditionalRules on any regular field.
// e.g. income (number field) carries a rule: if > 20000 → show qle (select field)
const FIELD_TYPES = [
  'text', 'email', 'phone', 'number',
  'select', 'radio', 'checkbox',
  'textarea', 'date',
  'hidden', 'api_autofill',
  'token_jornaya', 'token_trustedform',
  'static_value',
];

const optionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    value: { type: String, required: true },
  },
  { _id: false }
);

// Conditional rule — lives on the SOURCE field
// Example: income (number) has rule: operator=gt, value=20000, action=show, targetFieldKey=qle
const conditionalRuleSchema = new mongoose.Schema(
  {
    // Which field's value triggers the rule. Defaults to this field's key if null.
    sourceFieldKey: { type: String, default: null },
    operator: {
      type: String,
      enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'],
      required: true,
    },
    value:          { type: String },
    action:         { type: String, enum: ['show', 'hide', 'require'], required: true },
    targetFieldKey: { type: String, required: true },
  },
  { _id: false }
);

const fieldSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    key:   {
      type: String, required: true, unique: true,
      lowercase: true, trim: true,
      match: /^[a-z0-9_]+$/,
    },
    type:  { type: String, enum: FIELD_TYPES, required: true },

    placeholder:  { type: String },
    defaultValue: { type: mongoose.Schema.Types.Mixed },

    // For static_value type — always injected as-is into API calls
    staticValue: { type: String },

    // For select / radio / checkbox
    options: [optionSchema],

    // Validation rules
    validation: {
      minLength: Number,
      maxLength: Number,
      min:       Number,
      max:       Number,
      pattern:   String,
    },

    // Conditional rules — when THIS field matches, show/hide targetFieldKey
    conditionalRules: [conditionalRuleSchema],

    description:    { type: String },

    // Default API param name (can be overridden per-campaign per-destination)
    ringbaParamKey: { type: String },

    isGlobal: { type: Boolean, default: true },
  },
  { timestamps: true }
);

fieldSchema.index({ key: 1 });
fieldSchema.index({ type: 1 });

module.exports = mongoose.model('Field', fieldSchema);
module.exports.FIELD_TYPES = FIELD_TYPES;
