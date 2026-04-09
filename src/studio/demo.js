import { DEMO_GRAPH_OPTIONS, getDemoGraph } from '../data/demoGraphs.js';

export { DEMO_GRAPH_OPTIONS };

export function generateDemoRawGraph(key = 'les-miserables') {
  return getDemoGraph(key);
}
