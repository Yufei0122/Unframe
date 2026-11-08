import { createHash } from 'node:crypto';
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export const resultDigest = value => createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex');
