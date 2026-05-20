'use strict';

const { z } = require('zod');
const AppError = require('../utils/AppError');

const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const messages = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    return next(new AppError(`Validation failed: ${messages}`, 422));
  }
  req.body = result.data;
  next();
};

const schemas = {
  register: z.object({
    name:          z.string().min(2).max(100),
    email:         z.string().email(),
    password:      z.string().min(8).max(72),
    publisherName: z.string().min(2).max(100),
  }),

  login: z.object({
    email:    z.string().email(),
    password: z.string().min(1),
  }),

  createPublisher: z.object({
    name:         z.string().min(2).max(100),
    slug:         z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
    contactEmail: z.string().email(),
    contactPhone: z.string().optional(),
    notes:        z.string().optional(),
    ipWhitelist:  z.array(z.string()).optional(),
  }),

  createField: z.object({
    label:         z.string().min(1).max(100),
    key:           z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
    type:          z.enum([
      'text','email','phone','number','select','radio',
      'checkbox','textarea','date','hidden','api_autofill',
      'token_jornaya','token_trustedform','static_value','conditional',
    ]),
    placeholder:   z.string().optional(),
    staticValue:   z.string().optional(),
    defaultValue:  z.any().optional(),
    options:       z.array(z.object({ label: z.string(), value: z.string() })).optional(),
    conditionalRules: z.array(z.object({
      sourceFieldKey: z.string().optional(),
      operator:       z.enum(['eq','neq','gt','gte','lt','lte','contains','exists']),
      value:          z.string().optional(),
      action:         z.enum(['show','hide','require']),
      targetFieldKey: z.string(),
    })).optional(),
    validation: z.object({
      minLength: z.number().optional(),
      maxLength: z.number().optional(),
      pattern:   z.string().optional(),
      min:       z.number().optional(),
      max:       z.number().optional(),
    }).optional(),
    description:    z.string().optional(),
    ringbaParamKey: z.string().optional(),
  }),

  createCampaign: z.object({
    name:        z.string().min(2).max(100),
    publisher:   z.string().min(1),
    description: z.string().optional(),
    isActive:    z.boolean().optional(),

    // Destination
    destination:           z.enum(['ringba_regular','ringba_rtb','callgrid','ringba_regular_and_callgrid','ringba_rtb_and_callgrid']).optional(),
    ringbaId:              z.string().optional(),
    ringbaRtbUrl:          z.string().optional(),
    ringbaRtbKey:          z.string().optional(),
    callgridUrl:           z.string().optional(),
    callgridCallerIdParam: z.string().optional(),
    callgridStateParam:    z.string().optional(),
    callgridZipParam:      z.string().optional(),

    // Compliance
    jornayaEnabled:    z.boolean().optional(),
    trustedFormEnabled: z.boolean().optional(),
    apiAutofillEnabled: z.boolean().optional(),
    apiIntegration:    z.string().optional(),
    tags:              z.array(z.string()).optional(),

    fields: z.array(z.object({
      field:               z.string(),
      isRequired:          z.boolean().optional(),
      order:               z.number().optional(),
      overrideLabel:       z.string().optional(),
      overridePlaceholder: z.string().optional(),
      overrideDefaultValue: z.any().optional(),
      includeInRingba:     z.boolean().optional(),
      conditionalRules: z.array(z.object({
        fieldKey:       z.string(),
        operator:       z.enum(['eq','neq','gt','gte','lt','lte','contains','exists']),
        value:          z.any().optional(),
        action:         z.enum(['show','hide','require']),
        targetFieldKey: z.string(),
      })).optional(),
    })).optional(),
  }),

  submitLead: z.object({
    campaignId: z.string().min(1),
    data:       z.record(z.any()),
  }),

  ingestLead: z.object({
    campaignId: z.string().min(1),
    data:       z.record(z.any()),
  }),

  repostLead: z.object({
    targetCampaignId: z.string().min(1),
  }),
};

module.exports = { validate, schemas };
