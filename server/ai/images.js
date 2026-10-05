import sharp from 'sharp';
import { AIError, requireInput } from './config.js';
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export async function normalizeImage(bytes, mime) {
  if (bytes.length > MAX_IMAGE_BYTES) throw new AIError(413, 'IMAGE_TOO_LARGE', 'Choose an image smaller than 5 MB.');
  const signatures = {
    'image/jpeg': bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    'image/png': bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/webp': bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
  };
  if (!signatures[mime]) throw new AIError(415, 'INVALID_IMAGE_TYPE', 'Upload a valid JPEG, PNG or WebP image.');
  try {
    // Fully decode, limit decompression, strip EXIF/GPS; Vertex accepts JPEG/PNG.
    return await sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'warning' }).rotate().resize({ width: 1536, height: 1536, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
  } catch { throw new AIError(400, 'INVALID_IMAGE', 'This image is damaged or too large to decode. Please choose another.'); }
}
export async function readLimited(req, limit) {
  if (Number(req.headers['content-length']) > limit) throw new AIError(413, 'REQUEST_TOO_LARGE', 'Request is too large.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > limit) throw new AIError(413, 'REQUEST_TOO_LARGE', 'Request is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
export async function readImageUpload(req) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data;')) throw new AIError(415, 'MULTIPART_REQUIRED', 'Send multipart/form-data with one image field.');
  const bytes = await readLimited(req, MAX_IMAGE_BYTES + 65536);
  let form;
  try { form = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': type }, body: bytes }).formData(); }
  catch { throw new AIError(400, 'INVALID_MULTIPART', 'Invalid image upload.'); }
  requireInput([...form.keys()].every(k => ['image', 'visitorPreferences'].includes(k)) && form.getAll('image').length === 1 && form.getAll('visitorPreferences').length <= 1, 'Send one image and optional visitorPreferences.');
  const file = form.get('image');
  requireInput(file && typeof file !== 'string' && file.size > 0, 'Choose an image first.');
  let preferences = [];
  if (form.has('visitorPreferences')) {
    try { preferences = JSON.parse(form.get('visitorPreferences')); } catch { throw new AIError(400, 'INVALID_INPUT', 'Invalid visitor preferences.'); }
  }
  requireInput(Array.isArray(preferences) && preferences.length <= 10 && preferences.every(s => typeof s === 'string' && s.length <= 80), 'Invalid visitor preferences.');
  return { image: await normalizeImage(Buffer.from(await file.arrayBuffer()), file.type), preferences };
}
