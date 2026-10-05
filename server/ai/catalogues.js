import metadata from '../../shared/museums.json' with { type: 'json' };
import met from '../../shared/met-collection.json' with { type: 'json' };
import goma from '../../shared/goma-collection.json' with { type: 'json' };
import metGraph from '../../shared/met-graph.json' with { type: 'json' };
import gomaGraph from '../../shared/goma-graph.json' with { type: 'json' };

export const catalogues = new Map([
  ['met', { museum: metadata.met, collection: met, graph: metGraph }],
  ['goma', { museum: metadata.goma, collection: goma, graph: gomaGraph }],
]);
