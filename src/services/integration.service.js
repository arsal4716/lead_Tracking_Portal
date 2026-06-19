'use strict';

/**
 * Unified integration layer.
 *
 * All lead routing goes through IntegrationService.sendLead(campaign, leadData).
 * It hides vendor specifics (Ringba, Ringba RTB, CallGrid) behind one call and
 * returns a normalised result that always includes the exact request that was
 * sent (URL + params) and the raw vendor response — for super-admin visibility
 * and the audit trail.
 *
 * Vendor API keys / endpoints live only inside the provider implementations and
 * the campaign config; they are never returned to agents/admins (the controllers
 * decide how much of `results` to expose by role).
 */

const { sendToDestinations } = require('./ringba.service');

const PROVIDER_LABELS = {
  ringba_regular:              'Ringba',
  ringba_rtb:                  'Ringba RTB',
  callgrid:                    'CallGrid',
  ringba_regular_and_callgrid: 'Ringba + CallGrid',
  ringba_rtb_and_callgrid:     'Ringba RTB + CallGrid',
};

/**
 * Interpret vendor results into a call-routing decision.
 *
 * CallGrid: response.code === 1000 means an agent/target IS available → send the
 * call. Any other code means no agent → do NOT send (retry).
 * Ringba (regular/RTB): returns only "status: ok" — there is no code-1000 signal,
 * so a successful send simply means accepted (no availability gating).
 */
const interpretAvailability = (results = {}) => {
  const cg = results.callgrid;
  if (cg) {
    const resp = (cg.response && typeof cg.response === 'object') ? cg.response : {};
    const code = resp.code;
    const available = !!cg.sent && code === 1000;
    return {
      provider:       'callgrid',
      agentAvailable: available,
      code:           code !== undefined ? code : null,
      phoneNumber:    resp.phoneNumber || null,
      message: available
        ? `Agent available — SEND THE CALL${resp.phoneNumber ? ` to ${resp.phoneNumber}` : ''}.`
        : 'No agents available right now — DO NOT send the call. Ping again in a moment.',
    };
  }

  const rb = results.ringba || results.ringbaRtb;
  if (rb) {
    const available = !!rb.sent;
    return {
      provider:       rb.provider || 'ringba',
      agentAvailable: available,
      code:           null, // Ringba has no code-1000 gating
      phoneNumber:    null,
      message: available
        ? 'Lead accepted — send the call.'
        : 'Lead not accepted — do not send the call.',
    };
  }

  return { provider: null, agentAvailable: false, code: null, phoneNumber: null, message: 'No destination configured.' };
};

const IntegrationService = {
  /**
   * Route a lead to every destination configured on the campaign.
   *
   * @param {Object} campaign  populated campaign (with .fields.field + .destination)
   * @param {Object} leadData  flat key/value lead data
   * @param {Object} [opts]
   * @param {string} [opts.agentName] logged-in agent name to inject into the call
   * @returns {Promise<{sent:boolean, provider:string, providerLabel:string, results:Object}>}
   */
  async sendLead(campaign, leadData, opts = {}) {
    const { agentName = null } = opts;
    const provider = campaign.destination || 'ringba_regular';

    const { sent, results } = await sendToDestinations(campaign, leadData, agentName);

    return {
      sent,
      provider,
      providerLabel: PROVIDER_LABELS[provider] || provider,
      results,
      availability: interpretAvailability(results),
    };
  },

  providerLabel(provider) {
    return PROVIDER_LABELS[provider] || provider;
  },
};

module.exports = { IntegrationService, PROVIDER_LABELS, interpretAvailability };
