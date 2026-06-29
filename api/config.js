const { handleConfig, sendJson } = require('./_trtc');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    sendJson(res, 405, { error: 'Method Not Allowed' });
    return;
  }
  await handleConfig(req, res);
};
