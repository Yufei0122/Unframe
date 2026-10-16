import { AIError } from './config.js';

// Only these public services receive short title/artist search terms. Never images.
const hosts = new Set(['collectionapi.metmuseum.org', 'images.metmuseum.org', 'api.artic.edu', 'www.artic.edu', 'commons.wikimedia.org', 'upload.wikimedia.org']);
export function publicURL(value) {
  let url;
  try { url = new URL(value); } catch { throw new AIError(502, 'SOURCE_URL_INVALID', 'A public source returned an invalid address.'); }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash) throw new AIError(502, 'SOURCE_URL_INVALID', 'The public reference address is not supported.');
  return url;
}
export function createPublicClient({ fetchImpl = fetch } = {}) {
  return { async get(value, { signal, image = false } = {}) {
    let url = publicURL(value);
    const deadline = AbortSignal.timeout(10000);
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(url, { redirect: 'manual', signal: combined, headers: { Accept: image ? 'image/jpeg,image/png,image/webp' : 'application/json', 'User-Agent': 'Unframe/0.1 (local artwork research prototype)' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (!location || redirects === 3) throw new Error('SOURCE_REDIRECT');
        url = publicURL(new URL(location, url));
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new Error('SOURCE_UNAVAILABLE'); }
      const type = (response.headers.get('content-type') || '').split(';')[0].trim();
      if (image ? !['image/jpeg', 'image/png', 'image/webp'].includes(type) : !type.includes('json')) { await response.body?.cancel(); throw new Error('SOURCE_CONTENT_TYPE'); }
      const limit = image ? 5 * 1024 * 1024 : 1024 * 1024;
      if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('SOURCE_TOO_LARGE'); }
      const chunks = []; let length = 0;
      for await (const chunk of response.body) {
        length += chunk.length;
        if (length > limit) throw new Error('SOURCE_TOO_LARGE');
        chunks.push(Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      return image ? { bytes, mime: type } : JSON.parse(bytes.toString('utf8'));
    }
  } };
}
const short = (value, max = 300) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
const id = value => Number.isSafeInteger(value) && value > 0;
const imageURL = value => { try { return publicURL(value).href; } catch { return null; } };

export function createPublicCatalogues({ client = createPublicClient() } = {}) {
  async function met(query, signal) {
    const url = new URL('https://collectionapi.metmuseum.org/public/collection/v1/search');
    url.search = new URLSearchParams({ q: query.title, title: 'true', hasImages: 'true' });
    const result = await client.get(url, { signal });
    if (!Array.isArray(result.objectIDs) && result.objectIDs !== null) throw new Error('SOURCE_RESPONSE');
    const records = [];
    for (const objectId of (result.objectIDs || []).filter(id).slice(0, 2)) {
      const item = await client.get(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`, { signal });
      if (item.objectID !== objectId || !short(item.title)) continue;
      records.push({ id: `met:${objectId}`, provider: 'The Met', title: short(item.title), artist: short(item.artistDisplayName) || null, date: short(item.objectDate) || null,
        sourceUrl: `https://www.metmuseum.org/art/collection/search/${objectId}`, imageUrl: item.isPublicDomain === true ? imageURL(item.primaryImageSmall || item.primaryImage) : null });
    }
    return records;
  }
  async function artic(query, signal) {
    const url = new URL('https://api.artic.edu/api/v1/artworks/search');
    url.search = new URLSearchParams({ q: [query.title, query.artist].filter(Boolean).join(' '), limit: '2', fields: 'id,title,artist_title,date_display,image_id,is_public_domain', 'query[term][is_public_domain]': 'true' });
    const result = await client.get(url, { signal });
    if (!Array.isArray(result.data)) throw new Error('SOURCE_RESPONSE');
    const base = result.config?.iiif_url;
    return result.data.filter(item => id(item.id) && short(item.title)).slice(0, 2).map(item => ({
      id: `artic:${item.id}`, provider: 'Art Institute of Chicago', title: short(item.title), artist: short(item.artist_title) || null, date: short(item.date_display) || null,
      sourceUrl: `https://www.artic.edu/artworks/${item.id}`,
      imageUrl: item.is_public_domain === true && typeof item.image_id === 'string' && /^[a-zA-Z0-9-]+$/.test(item.image_id) && typeof base === 'string'
        ? imageURL(`${base}/${item.image_id}/full/600,/0/default.jpg`) : null,
    }));
  }
  async function commons(query, signal) {
    const url = new URL('https://commons.wikimedia.org/w/api.php');
    url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', generator: 'search', gsrnamespace: '6', gsrlimit: '2',
      gsrsearch: `"${query.title.replaceAll('"', '')}" ${query.artist || ''} filetype:bitmap`, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600' });
    const result = await client.get(url, { signal });
    if (result.error || (result.query && !Array.isArray(result.query.pages))) throw new Error('SOURCE_RESPONSE');
    return (result.query?.pages || []).filter(item => id(item.pageid) && typeof item.title === 'string' && item.title.startsWith('File:')).slice(0, 2).map(item => ({
      id: `commons:${item.pageid}`, provider: 'Wikimedia Commons', title: short(item.title.replace(/^File:/, '').replaceAll('_', ' ')), artist: null, date: null,
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`, imageUrl: imageURL(item.imageinfo?.[0]?.thumburl),
    }));
  }
  return {
    async search(hypotheses, signal) {
      const providers = await Promise.all([['The Met', met], ['Art Institute of Chicago', artic], ['Wikimedia Commons', commons]].map(async ([name, search]) => {
        const records = []; let failures = 0, attempts = 0;
        for (const hypothesis of hypotheses.slice(0, 2)) {
          attempts++;
          try { records.push(...await search(hypothesis, signal)); } catch { failures++; }
          if (records.length >= 2 || signal?.aborted) break;
        }
        return { name, status: failures ? failures === attempts ? 'unavailable' : 'partial' : 'completed', records: [...new Map(records.map(item => [item.id, item])).values()].slice(0, 2) };
      }));
      // Interleave providers so visual checks include more than one collection.
      const records = [0, 1].flatMap(index => providers.flatMap(provider => provider.records[index] || []));
      return { records, providers: providers.map(({ name, status, records }) => ({ name, status, results: records.length })) };
    },
    image: (url, signal) => client.get(url, { image: true, signal }),
  };
}
