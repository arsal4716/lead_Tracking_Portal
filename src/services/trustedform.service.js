'use strict';

const axios = require('axios');

const validateTrustedForm = async (certUrl) => {
  if (!certUrl) {
    return { valid: false, certId: null, reason: 'TrustedForm cert URL missing', raw: null };
  }

  try {
    const certId = certUrl.split('/').pop().split('?')[0];
    const apiKey = process.env.TRUSTEDFORM_API_KEY;
    const credentials = Buffer.from(`X:${apiKey}`).toString('base64');

    const response = await axios.post(
      `https://cert.trustedform.com/${certId}/validate`,
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    const data = response.data;
    const isValid = data?.outcome === 'success';

    return {
      valid: isValid,
      certId,
      reason: data?.reason || (isValid ? 'Verified' : 'Validation failed'),
      raw: data,
    };
  } catch (err) {
    const errData = err.response?.data;
    return {
      valid: false,
      certId: null,
      reason: errData?.reason || `TrustedForm error: ${err.message}`,
      raw: errData || null,
    };
  }
};

module.exports = { validateTrustedForm };
