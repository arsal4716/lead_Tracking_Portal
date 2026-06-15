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
    };
  },

  providerLabel(provider) {
    return PROVIDER_LABELS[provider] || provider;
  },
};

module.exports = { IntegrationService, PROVIDER_LABELS };
