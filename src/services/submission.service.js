'use strict';

const Campaign   = require('../models/Campaign');
const Submission = require('../models/Submission');
const User       = require('../models/User');
const AppError   = require('../utils/AppError');
const { validateJornaya }    = require('./jornaya.service');
const { validateTrustedForm } = require('./trustedform.service');
const { sendToDestinations } = require('./ringba.service');

// ── Load campaign ──────────────────────────────────────────────────────────────
const loadCampaign = async (campaignId, publisherId, userRole) => {
  const query = { _id: campaignId, isActive: true };

  const { ROLES } = require('../models/User');
  if (userRole !== ROLES.SUPER_ADMIN && publisherId) {
    query.publisher = publisherId;
  }

  const campaign = await Campaign.findOne(query)
    .populate({
      path:   'fields.field',
      // MUST include staticValue + conditionalRules for both features to work
      select: 'key label type ringbaParamKey staticValue options validation conditionalRules',
    })
    .populate('publisher', 'name _id')
    .lean();

  if (!campaign) throw new AppError('Campaign not found or inactive.', 404);
  return campaign;
};

// ── Evaluate conditionals (backend validation) ────────────────────────────────
const evaluateConditionals = (campaign, data) => {
  const visible = new Set();

  for (const cf of campaign.fields) {
    const f = cf.field;
    if (!f) continue;
    if (!['hidden','token_jornaya','token_trustedform','static_value','api_autofill'].includes(f.type)) {
      visible.add(f.key);
    }
  }

  for (const cf of campaign.fields) {
    const field = cf.field;
    if (!field || !field.conditionalRules?.length) continue;

    for (const rule of field.conditionalRules) {
      const sourceKey = rule.sourceFieldKey || field.key;
      const sourceVal = data[sourceKey];

      let matches = false;
      switch (rule.operator) {
        case 'eq':       matches = String(sourceVal ?? '') === String(rule.value ?? ''); break;
        case 'neq':      matches = String(sourceVal ?? '') !== String(rule.value ?? ''); break;
        case 'gt':       matches = Number(sourceVal) >  Number(rule.value); break;
        case 'gte':      matches = Number(sourceVal) >= Number(rule.value); break;
        case 'lt':       matches = Number(sourceVal) <  Number(rule.value); break;
        case 'lte':      matches = Number(sourceVal) <= Number(rule.value); break;
        case 'contains': matches = String(sourceVal ?? '').includes(String(rule.value ?? '')); break;
        case 'exists':   matches = sourceVal !== undefined && sourceVal !== null && sourceVal !== ''; break;
      }

      if (rule.action === 'show')    { if (matches) visible.add(rule.targetFieldKey); else visible.delete(rule.targetFieldKey); }
      if (rule.action === 'hide')    { if (matches) visible.delete(rule.targetFieldKey); }
      if (rule.action === 'require') { if (matches) visible.add(rule.targetFieldKey); }
    }
  }

  return visible;
};

// ── Duplicate check ────────────────────────────────────────────────────────────
const checkDuplicate = async (phone, publisherId) => {
  if (!phone) return { isDuplicate: false };
  const existing = await Submission.findOne({ phone, publisher: publisherId })
    .sort({ createdAt: -1 }).lean();
  return { isDuplicate: !!existing };
};

// ── Compliance validation ──────────────────────────────────────────────────────
const runValidation = async (campaign, data) => {
  const result = { jornaya: { enabled: false }, trustedForm: { enabled: false } };

  if (campaign.jornayaEnabled) {
    const lac     = data.jornaya_lac || data.leadid_token || data.universal_leadid;
    const jResult = await validateJornaya(lac);
    result.jornaya = { enabled: true, valid: jResult.valid, transId: jResult.transId, message: jResult.message };
    if (!jResult.valid) throw new AppError(`Jornaya validation failed: ${jResult.message}`, 422);
  }

  if (campaign.trustedFormEnabled) {
    const certUrl  = data.xxTrustedFormCertUrl || data.trusted_form_cert_url;
    const tfResult = await validateTrustedForm(certUrl);
    result.trustedForm = { enabled: true, valid: tfResult.valid, certId: tfResult.certId, reason: tfResult.reason };
    if (!tfResult.valid) throw new AppError(`TrustedForm validation failed: ${tfResult.reason}`, 422);
  }

  return result;
};

// ── Main pipeline ──────────────────────────────────────────────────────────────
const processSubmission = async ({
  campaignId, publisherId, agentId,
  data, source = 'form', userRole,
  ipAddress, userAgent, repostOf = null,
}) => {
  const campaign           = await loadCampaign(campaignId, publisherId, userRole);
  const effectivePublisherId = campaign.publisher._id || campaign.publisher;

  // Normalise incoming data (handle Mongoose Maps from repost)
  const rawData = data instanceof Map
    ? Object.fromEntries(data)
    : (typeof data?.toObject === 'function' ? data.toObject() : (data || {}));

  const phone = rawData.phone || rawData.callerid || rawData.caller_id || rawData.mobile;

  const { isDuplicate } = await checkDuplicate(phone, effectivePublisherId);
  const validation      = await runValidation(campaign, rawData);

  const submission = await Submission.create({
    publisher:   effectivePublisherId,
    campaign:    campaign._id,
    agent:       agentId || null,
    source,
    repostOf,
    data:        rawData,
    phone,
    jornaya:     validation.jornaya,
    trustedForm: validation.trustedForm,
    apiAutofill: { used: false },
    isDuplicate,
    ipAddress,
    userAgent,
    status: 'valid',
  });

  // Look up agent name for API injection
  let agentName = null;
  if (agentId) {
    try {
      const agentDoc = await User.findById(agentId).select('name').lean();
      agentName = agentDoc?.name || null;
    } catch (_) {}
  }

  const enrichedData = {
    ...rawData,
    _source:      source,
    _publisherId: effectivePublisherId.toString(),
    _campaignId:  campaign._id.toString(),
  };

  // Send to destination(s) with agent name
  const { sent, results } = await sendToDestinations(campaign, enrichedData, agentName);

  await Submission.findByIdAndUpdate(submission._id, {
    ringba:             results.ringba     || { sent: false },
    destinationResults: results,
    status:             sent ? 'sent' : 'failed',
  });

  return {
    submissionId:       submission._id,
    status:             sent ? 'sent' : 'failed',
    isDuplicate,
    ringba:             results.ringba || null,
    destinationResults: results,
    validation,
  };
};

// ── Repost ─────────────────────────────────────────────────────────────────────
const repostSubmission = async ({ originalSubmissionId, targetCampaignId, userId, userRole, publisherId }) => {
  const original = await Submission.findById(originalSubmissionId).lean();
  if (!original) throw new AppError('Original submission not found.', 404);

  if (userRole !== 'super_admin' && original.publisher.toString() !== publisherId) {
    throw new AppError('Access denied.', 403);
  }

  const originalData = original.data instanceof Map
    ? Object.fromEntries(original.data)
    : (typeof original.data?.toObject === 'function'
      ? original.data.toObject()
      : (original.data || {}));

  return processSubmission({
    campaignId:  targetCampaignId,
    publisherId: original.publisher.toString(),
    agentId:     userId,
    data:        originalData,
    source:      'repost',
    userRole,
    repostOf:    originalSubmissionId,
  });
};

module.exports = { processSubmission, repostSubmission, loadCampaign, evaluateConditionals };
