const { handleToken, sendJson } = require('./_livekit');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  await handleToken(req, res);
};
