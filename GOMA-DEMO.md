# Brisbane GOMA demo

Collected from official QAGOMA records and stories on 2026-10-03. No Google AI calls were made to collect these records or test the integration.

## Museum

**Gallery of Modern Art (GOMA)**, Stanley Place, South Brisbane, Queensland 4101, Australia. GOMA is part of Queensland Art Gallery | Gallery of Modern Art (QAGOMA). [Official visitor information](https://www.qagoma.qld.gov.au/visit/).

The app uses an approximate outdoor coordinate (-27.4709, 153.0172) to offer the nearby demo, with a 300 m radius and a reported accuracy no worse than 300 m. This cannot distinguish individual galleries or the nearby QAG building. Indoor positions are never inferred from GPS. You can always select either museum manually; selection lasts for the current app session.

## Collection selection

| Work | Artist | Date | Official catalogue |
| --- | --- | --- | --- |
| The obliteration room | Yayoi Kusama | 2002–present | [2012.098](https://collection.qagoma.qld.gov.au/objects/18336) |
| In bed | Ron Mueck | 2005 | [2008.040](https://collection.qagoma.qld.gov.au/objects/11850) |
| Heritage | Cai Guo-Qiang | 2013 | [2013.190.001-099](https://collection.qagoma.qld.gov.au/objects/20154) |
| Soul under the moon | Yayoi Kusama | 2002 | [2002.143a-y](https://collection.qagoma.qld.gov.au/objects/14351) |

These are QAGOMA Collection works with a history of presentation at GOMA, not a current exhibition list. Consult the official records for current display information. Dates and materials follow catalogue metadata; English introductions, Chinese translations, interest tags and estimated viewing times are prototype editorial content. Chinese titles are translations for this demo, not claimed official catalogue titles.

Local images are from QAGOMA's public Stories and Visit pages, with source links and copyright credits in [mobile/assets/SOURCES.md](mobile/assets/SOURCES.md). The obliteration room photograph shows its white starting state. The images record past installations; contemporary artworks and photographs are not CC0.

## App and API behavior

- Open the discovery entrance → **Brisbane** → **Choose GOMA** → **Start Visit**. Artwork cards, search, details, bilingual device speech and saved artworks work locally.
- GOMA has a separate schematic map. The four room names, their positions, walking distances, durations and accessibility flags are invented for this demo. They are not the official GOMA floor plan.
- The bottom **Plan** chat sends `museumId: "goma"` with conversational preference updates and route requests, then opens a separate result page. Its museum and graph are captured with the result. The backend limits recommendation IDs, starting points and must-see selections to that museum. Route generation uses a local fallback when Google recommendations are unavailable; failed chat messages remain retryable.
- `GET /api/ai/catalogue?museumId=goma` returns the GOMA catalogue and graph. `POST /api/ai/artworks/recognise?museumId=goma` searches only GOMA index entries. Omitting the museum still defaults to `met`; unknown IDs return 400.
- Restart the Node backend to load the new catalogue. Browsing and route planning do not need new embeddings. Photo recognition of GOMA works requires rebuilding the reference index with `npm.cmd run ai:index` after configuring Google Cloud. It indexes all 12 artworks and makes 12 billable embedding requests. The collection work here did **not** run that command or change credentials.

Data lives in `shared/goma-collection.json`, `shared/goma-graph.json` and `shared/museums.json`. No database migration or new dependency is needed.
