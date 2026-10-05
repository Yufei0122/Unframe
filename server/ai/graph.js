export function shortestPath(graph, from, to, { stepFree = false, metric = 'distance' } = {}) {
  const pending = new Set(graph.nodes.map(n => n.id));
  if (!pending.has(from) || !pending.has(to)) return null;
  const cost = new Map([[from, 0]]), previous = new Map();
  while (pending.size) {
    const node = [...pending].sort((a, b) => (cost.get(a) ?? Infinity) - (cost.get(b) ?? Infinity))[0];
    if (!Number.isFinite(cost.get(node))) break;
    if (node === to) {
      const nodes = [node]; let current = node, distance = 0, estimatedSeconds = 0;
      while (previous.has(current)) { const { parent, edge } = previous.get(current); nodes.unshift(parent); distance += edge.distance; estimatedSeconds += edge.estimatedSeconds; current = parent; }
      return { from, to, nodes, distance, estimatedSeconds };
    }
    pending.delete(node);
    for (const edge of graph.edges) {
      if (stepFree && !edge.accessible) continue;
      const next = edge.from === node ? edge.to : edge.to === node ? edge.from : null;
      if (!pending.has(next)) continue;
      const value = cost.get(node) + edge[metric];
      if (value < (cost.get(next) ?? Infinity)) { cost.set(next, value); previous.set(next, { parent: node, edge }); }
    }
  }
  return null;
}
