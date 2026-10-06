# The Met demo assets

For the five nearby-museum preview photographs, see [museum discovery image sources](../../MUSEUM-DISCOVERY.md#new-photo-assets).

- `met-exterior.jpg`: Alvin David, “The met banner on classical building entrance”, https://unsplash.com/photos/6_W4k0CWnns (Unsplash License). Downloaded from https://images.unsplash.com/photo-1764473814276-6032e9070f61 .
- `water-lilies.jpg`: Claude Monet, *Water Lilies*, 1916–19. The Met, 1983.532. CC0 image donated by The Met and available at https://commons.wikimedia.org/wiki/File:Water_Lilies_MET_DT1856.jpg . Collection record: https://www.metmuseum.org/art/collection/search/437137 .
- `the-harvesters.jpg`: Pieter Bruegel the Elder, *The Harvesters*, 1565. The Met Open Access / public domain. https://www.metmuseum.org/art/collection/search/435809 . Image: https://images.metmuseum.org/CRDImages/ep/web-large/DP119115.jpg .
- `the-dancing-class.jpg`: Edgar Degas, *The Dancing Class*, ca. 1870. The Met Open Access / public domain. https://www.metmuseum.org/art/collection/search/436141 . Image: https://images.metmuseum.org/CRDImages/ep/web-large/DP-25445-001.jpg .

## Additional catalogue works

Official records and API public-domain flags checked on 2026-10-03. These five images are from The Met Open Access collection and are bundled for offline viewing.

- `wheat-field-with-cypresses.jpg`: Vincent van Gogh, *Wheat Field with Cypresses*, 1889, oil on canvas. [The Met record 436535](https://www.metmuseum.org/art/collection/search/436535). [Image](https://images.metmuseum.org/CRDImages/ep/web-large/DP-42549-001.jpg).
- `young-woman-with-a-water-pitcher.jpg`: Johannes Vermeer, *Young Woman with a Water Pitcher*, ca. 1662, oil on canvas. [The Met record 437881](https://www.metmuseum.org/art/collection/search/437881). [Image](https://images.metmuseum.org/CRDImages/ep/web-large/DP353257.jpg).
- `the-card-players.jpg`: Paul Cézanne, *The Card Players*, 1890–92, oil on canvas. [The Met record 435868](https://www.metmuseum.org/art/collection/search/435868). [Image](https://images.metmuseum.org/CRDImages/ep/web-large/DP231550.jpg).
- `madame-charpentier-and-her-children.jpg`: Auguste Renoir, *Madame Georges Charpentier and Her Children*, 1878, oil on canvas. Shortened display title; the official record includes the sitters’ full names and dates. [The Met record 438815](https://www.metmuseum.org/art/collection/search/438815). [Image](https://images.metmuseum.org/CRDImages/ep/web-large/DP-35674-001.jpg).
- `self-portrait-with-a-straw-hat.jpg`: Vincent van Gogh, *Self-Portrait with a Straw Hat*, 1887, oil on canvas. Shortened display title; the official title also identifies *The Potato Peeler* on the other side. [The Met record 436532](https://www.metmuseum.org/art/collection/search/436532). [Image](https://images.metmuseum.org/CRDImages/ep/web-large/DT1502_cropped2.jpg).

The UI uses accurate metadata for these works instead of the mismatched artist/date labels in the design reference. Introductory text and Chinese translations are original prototype copy, not museum-approved interpretation. The floor plan is drawn in code as a design illustration; room placement, floor assignments, visit durations, accessibility, the blue marker and artwork distances are demo data, not The Met navigation data. Inclusion in this demo does not indicate that a work is currently on view; consult the official record for availability.

The Met catalogue has eight artworks; the GOMA demo adds four below. After configuring Google Cloud, `npm.cmd run ai:index` rebuilds the recognition index for all twelve (twelve billable embedding requests). This command was not run when collecting the GOMA sources. Catalogue browsing and route planning do not require this index.

## Brisbane GOMA / QAGOMA assets

Official records and image captions checked on 2026-10-03. These contemporary artworks and photographs retain the rights credited below; they are not CC0. Bundled here for this research prototype. Full catalogue links and the distinction between shared QAGOMA holdings and current GOMA displays are documented in [GOMA-DEMO.md](../../GOMA-DEMO.md).

- `goma-exterior.jpg`: GOMA exterior. Photograph: M Sherwood © QAGOMA. [Official visit page](https://www.qagoma.qld.gov.au/visit/). [Image](https://cdn.sanity.io/images/m2obzhc2/production/f11e4454da8be66a453b378e42a3fdf395227b44-2500x1875.jpg/GOMA_Exterior_20120621_msherwood_0001.jpg).
- `goma-obliteration-room.jpg`: Yayoi Kusama, *The obliteration room*, 2002–present. The white room before audience participation. © Yayoi Kusama. Courtesy: Yayoi Kusama Studio, Inc. [Official story and caption](https://www.qagoma.qld.gov.au/stories/the-obliteration-room-by-yayoi-kusama-once-looked-like-this). [Image](https://cdn.sanity.io/images/m2obzhc2/production/2fa07ce616904ff03548872750c89b7dd8ef7c64-1170x773.jpg/web-blog_GOMA_YayoiKusama_installationview_20171012_nharth_004.jpg).
- `goma-in-bed.jpg`: Ron Mueck, *In bed*, 2005. © Ron Mueck. Photograph: J Ruckli © QAGOMA. [Official story and caption](https://www.qagoma.qld.gov.au/stories/getting-ready-for-bed-contemporary-art-conservation-for-ron-mueck-in-bed/). [Image](https://cdn.sanity.io/images/m2obzhc2/production/e647f9869425da58a4b810154ba314b878b11fbc-1170x773.jpg/web-blog_ron-mueck-20221125_jruckli_Air_OfficialOpening_345.jpg).
- `goma-heritage.jpg`: Cai Guo-Qiang, *Heritage*, 2013. © Cai Guo-Qiang. Photograph: Natasha Harth © QAGOMA. [Official story and caption](https://www.qagoma.qld.gov.au/stories/commissioning-heritage-an-installation-by-cai-guo-qiang/). [Image](https://cdn.sanity.io/images/m2obzhc2/production/0fac22841e55f0e34d462ca6a7b3fd2dee31e536-1170x773.jpg/BLOG_cai.jpg).
- `goma-soul-under-the-moon.jpg`: Yayoi Kusama, *Soul under the moon*, 2002. © Yayoi Kusama. Courtesy: Yayoi Kusama Studio, Inc. [Official story and caption](https://www.qagoma.qld.gov.au/stories/yayoi-kusama-life-is-the-heart-of-a-rainbow). [Image](https://cdn.sanity.io/images/m2obzhc2/production/3efff13ad2997c9f8bba65f53065273ad4bc68ff-1170x773.jpg/web-blog_20171103_ccallistemon_YayoiKusama_MediaPreview_126.jpg).
