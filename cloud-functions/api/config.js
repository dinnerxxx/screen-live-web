import { handleConfig, methodNotAllowed } from './_trtc.js';

export async function onRequest({ request }) {
  if (request.method !== 'GET') return methodNotAllowed();
  return handleConfig();
}

export default onRequest;
