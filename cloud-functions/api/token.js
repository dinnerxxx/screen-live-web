import { handleToken, methodNotAllowed } from './_trtc.js';

export async function onRequest({ request }) {
  if (request.method !== 'POST') return methodNotAllowed();
  return handleToken(request);
}

export default onRequest;
