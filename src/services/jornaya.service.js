'use strict';

const axios = require('axios');

const validateJornaya = async (lac) => {
  if (!lac) {
    return { valid: false, message: 'Jornaya LAC token missing', transId: null, raw: null };
  }

  try {
    const url = `https://api.leadid.com/Authenticate`;
    const response = await axios.get(url, {
      params: {
        lac,
        id: process.env.JORNAYA_API_ID,
      },
      timeout: 8000,
    });

    const data = response.data;
    const isValid = data?.authentic === 1 || data?.authentic === '1';

    return {
      valid: isValid,
      transId: data?.transId || data?.transaction_id || null,
      message: isValid ? 'Authenticated' : (data?.message || 'Authentication failed'),
      raw: data,
    };
  } catch (err) {
    console.error('Jornaya API error:', err.message);
    return {
      valid: false,
      transId: null,
      message: `Jornaya service error: ${err.message}`,
      raw: null,
    };
  }
};

module.exports = { validateJornaya };
