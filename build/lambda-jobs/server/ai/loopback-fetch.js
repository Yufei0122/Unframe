import http from 'node:http';
import https from 'node:https';

// Node fetch has its own five-minute headers deadline. Non-streaming CPU
// inference can exceed it even when the application's AbortSignal allows more.
// Use an unpooled local socket with only the caller's deadline; never redirect.
export function loopbackFetch(address, { method = 'GET', headers, body, signal } = {}) {
  const url = new URL(address);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Model requests must use a loopback HTTP origin without credentials.');
  }
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? https : http).request(url, { method, headers, signal, agent: false }, response => {
      const chunks = [];
      let size = 0;
      response.on('error', reject);
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) request.destroy(new Error('Local service response is too large.'));
        else chunks.push(chunk);
      });
      response.on('end', () => {
        const status = response.statusCode;
        if (status >= 300 && status < 400) return reject(new Error('Local service redirects are not allowed.'));
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers: response.headers }));
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}
