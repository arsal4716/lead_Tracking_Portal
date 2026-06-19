'use strict';

const axios = require('axios');

/**
 * Authenticate a lead's Jornaya (LeadiD) token.
 *
 * GET https://api.leadid.com/Authenticate?lac=<ACCOUNT_CODE>&id=<LEAD_TOKEN>
 *   - lac = your Jornaya account code (secret, from env)
 *   - id  = the lead's universal LeadiD token (from the form)
 *
 * Response shape:
 *   { "authenticate": { "authentic": 0|1, "reason": N, "token": "<id>" }, "transid": "..." }
 * Authentic only when authenticate.authentic === 1.
 *
 * Never throws — returns { valid, transId, message, raw } so the caller can
 * forward token_valid=yes/no instead of blocking the submission.
 */
const validateJornaya = async (token) => {
  if (!token) {
    return { valid: false, message: 'Jornaya token missing', transId: null, raw: null };
  }

  const accountCode = process.env.JORNAYA_LAC || process.env.JORNAYA_API_ID;
  if (!accountCode) {
    return { valid: false, message: 'Jornaya account code (JORNAYA_LAC) not configured', transId: null, raw: null };
  }

  try {
    const response = await axios.get('https://api.leadid.com/Authenticate', {
      params: { lac: accountCode, id: token },
      timeout: 8000,
    });

    const data = response.data || {};
    const auth = data.authenticate || {};
    const isValid = auth.authentic === 1 || auth.authentic === '1';

    return {
      valid:   isValid,
      transId: data.transid || data.transId || null,
      message: isValid ? 'Authenticated' : `Not authentic (reason ${auth.reason ?? 'unknown'})`,
      raw:     data,
    };
  } catch (err) {
    console.error('Jornaya API error:', err.response?.data || err.message);
    return {
      valid:   false,
      transId: null,
      message: `Jornaya service error: ${err.message}`,
      raw:     err.response?.data || null,
    };
  }
};

module.exports = { validateJornaya };
