# Museum discovery (web)

The entrance now opens a full-width photographic scene above an OpenLayers 10.10 map. Choosing The Met or GOMA opens the existing welcome and Start Visit flow. Other museums have photo previews and official website links, without borrowing either demo's artwork catalogue.

- New York: The Met, Solomon R. Guggenheim Museum, MoMA.
- Brisbane: GOMA, Queensland Art Gallery, Queensland Museum Kurilpa, Museum of Brisbane (City Hall).
- Each city cycles independently every 10 seconds. Photos slide and crossfade while the text eases into place. Swipe horizontally with a finger or press and drag with a mouse to reveal the next photo before release. Vertical touch scrolling remains available. The timer pauses while held, focused inside the scene, offscreen, or in a hidden tab; it stops when leaving the entrance. Reduced-motion preferences disable automatic rotation and transitions.
- City buttons reset to the demo museum. Map pins select a preview. Only pressing Choose commits the collection used by the existing visit and AI features.
- Actual device coordinates display a blue dot and straight-line distances. Denied/unavailable location keeps both city demos usable; no invented user position. Coordinates here represent buildings, not entrances or indoor navigation.
- The OpenStreetMap street tiles require an internet connection. Pins/previews remain usable if tiles fail. Attribution stays visible, native browser tile caching is preserved, and there is no offline tile prefetch. Automated tests intercept tile requests rather than driving the public OSM service.

## Sources (checked 2026-10-06)

Venue information comes from the official pages below. Brief preview copy is original. Building coordinates for the five new places were cross-checked against the coordinates of their respective Wikipedia articles; these are approximate building locations, not a routing dataset.

| Museum | Official visitor information | Coordinate reference |
| --- | --- | --- |
| Guggenheim | https://www.guggenheim.org/plan-your-visit | https://en.wikipedia.org/wiki/Solomon_R._Guggenheim_Museum |
| MoMA | https://www.moma.org/visit/ | https://en.wikipedia.org/wiki/Museum_of_Modern_Art |
| Queensland Art Gallery | https://www.qagoma.qld.gov.au/visit/ | https://en.wikipedia.org/wiki/Queensland_Art_Gallery |
| Queensland Museum Kurilpa | https://www.museum.qld.gov.au/kurilpa/plan-your-visit | https://en.wikipedia.org/wiki/Queensland_Museum |
| Museum of Brisbane | https://www.museumofbrisbane.com.au/visit-us/ | https://en.wikipedia.org/wiki/Brisbane_City_Hall |

Met/GOMA metadata and existing image credits remain in `shared/museums.json` and `mobile/assets/SOURCES.md`. New discovery metadata lives in `mobile/src/discovery.ts`.

## New photo assets

Images below were resized to a maximum width of 1200 px and JPEG quality 85 for this local demonstration. They remain copyrighted to their respective owners; these official-site photos are not represented as open-licensed assets. Obtain suitable rights or replace them before public/commercial distribution.

- `guggenheim-exterior.jpg`: aerial exterior, Guggenheim official homepage social image. https://www.guggenheim.org/wp-content/uploads/2024/11/architecture-srgm-exterior-drone-autumn.jpg
- `moma-exterior.jpg`: museum entrance, photograph Noah Kalina, official visit page. https://www.moma.org/assets/visit/entrance-image--museum-crop-7516b01003659172f2d9dbc7a6c2e9d9.jpg
- `qag-exterior.jpg`: QAG exterior, M Sherwood / QAGOMA. https://cdn.sanity.io/images/m2obzhc2/production/0c65a4158c433f9c43c2d89040d18405ec89ebde-2500x1725.jpg/QAG_Exterior_20150325_msherwood_002.jpg
- `kurilpa-exterior.jpg`: family at museum entrance, Queensland Museum official visit page. https://www.museum.qld.gov.au/assets/media/project/qm/qm-website/plan-your-visit/queensland-museum/visit-as-a-group/card-family-at-queensland-museum-entrance.jpg
- `mob-exterior.jpg`: Brisbane City Hall, Museum of Brisbane official visit page. https://www.museumofbrisbane.com.au/wp-content/uploads/2020/11/Banner-Visit-Us-City-Hall.jpg

Map integration follows https://openlayers.org/en/latest/examples/simple.html and https://operations.osmfoundation.org/policies/tiles/ . Web-specific components keep OpenLayers/DOM imports out of the native bundle. No Expo Go configuration changes are required.
