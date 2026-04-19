export const REFERENCE_LIBRARY = {
  holten2006: {
    id: 'holten2006',
    title: 'Hierarchical Edge Bundles: Visualization of Adjacency Relations in Hierarchical Data',
    authors: 'Danny Holten',
    year: 2006,
    why: 'Established the classic spline-based bundling idea for hierarchical structures and remains the canonical conceptual starting point.',
    link: 'https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf'
  },
  holten2009: {
    id: 'holten2009',
    title: 'Force-Directed Edge Bundling for Graph Visualization',
    authors: 'Danny Holten, Jarke J. van Wijk',
    year: 2009,
    why: 'Introduced the influential self-organizing force-based bundling model for general graphs.',
    link: 'https://doi.org/10.1111/j.1467-8659.2009.01450.x'
  },
  telea2010: {
    id: 'telea2010',
    title: 'Image-Based Edge Bundles: Simplified Visualization of Large Graphs',
    authors: 'Alexandru Telea, Ozan Ersoy',
    year: 2010,
    why: 'Shifted attention toward bundle-centric abstractions and skeletonized summaries rather than only curve deformation.',
    link: 'https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis10/paper.pdf'
  },
  gansner2011: {
    id: 'gansner2011',
    title: 'Multilevel Agglomerative Edge Bundling for Visualizing Large Graphs',
    authors: 'Emden R. Gansner, Yifan Hu, Stephen C. North, Carlos Scheidegger',
    year: 2011,
    why: 'Popularized scalable agglomerative routing and ink-saving bundle structures for larger graphs.',
    link: 'https://doi.org/10.1109/PACIFICVIS.2011.5742389'
  },
  ersoy2011: {
    id: 'ersoy2011',
    title: 'Skeleton-Based Edge Bundling for Graph Visualization',
    authors: 'Ozan Ersoy, Christophe Hurter, Fernando V. Paulovich, Gabriel Cantareira, Alexandru Telea',
    year: 2011,
    why: 'Grounded bundling in medial-axis and centerline extraction ideas, directly motivating structure-aware skeleton views.',
    link: 'https://doi.org/10.1109/TVCG.2011.233'
  },
  selassie2011: {
    id: 'selassie2011',
    title: 'Divided Edge Bundling for Directional Network Data',
    authors: 'David Selassie, Brandon Heller, Jeffrey Heer',
    year: 2011,
    why: 'Showed how bundles can preserve directional information by allocating separate lanes within a shared route.',
    link: 'https://doi.org/10.1109/TVCG.2011.190'
  },
  hurter2012: {
    id: 'hurter2012',
    title: 'Graph Bundling by Kernel Density Estimation',
    authors: 'Christophe Hurter, Ozan Ersoy, Alexandru Telea',
    year: 2012,
    why: 'Defined a fast image-space density formulation that inspired practical browser-friendly approximations of large-graph bundling.',
    link: 'https://doi.org/10.1111/j.1467-8659.2012.03079.x'
  },
  bourqui2016: {
    id: 'bourqui2016',
    title: 'Multilayer Graph Edge Bundling',
    authors: 'Romain Bourqui, Dino Ienco, Arnaud Sallaberry, Pascal Poncelet',
    year: 2016,
    why: 'Demonstrated how edge type and layer structure can be routed through a shared bundling design without erasing layer semantics.',
    link: 'https://doi.org/10.1109/PACIFICVIS.2016.7465267'
  },
  zielasko2016: {
    id: 'zielasko2016',
    title: 'Interactive 3D Force-Directed Edge Bundling',
    authors: 'Daniel Zielasko, Benjamin Weyers, B. Hentschel, Torsten W. Kuhlen',
    year: 2016,
    why: 'Extended bundling explicitly into 3D and emphasized interactive cluster-aware processing.',
    link: 'https://doi.org/10.1111/cgf.12881'
  },
  lhuillier2017: {
    id: 'lhuillier2017',
    title: 'FFTEB: Edge Bundling of Huge Graphs by the Fast Fourier Transform',
    authors: 'Antoine Lhuillier, Christophe Hurter, Alexandru Telea',
    year: 2017,
    why: 'Focused on scalability for huge graphs by moving image-based bundling into the frequency domain.',
    link: 'https://doi.org/10.1109/PACIFICVIS.2017.8031594'
  },
  wu2018: {
    id: 'wu2018',
    title: 'An Information-Theoretic Framework for Evaluating Edge Bundling Visualization',
    authors: 'Xin Liu, Jieting Wu, Feiyu Zhu, Hongfeng Yu',
    year: 2018,
    why: 'Provided a principled quality-evaluation perspective and motivates the benchmark panel in this studio.',
    link: 'https://doi.org/10.3390/e20090625'
  },
  wu2023: {
    id: 'wu2023',
    title: 'Accelerating Web-based Graph Visualization with Pixel-Based Edge Bundling',
    authors: 'Jieting Wu, Jianxin Sun, Xinyan Xie, Tian Gao, Yu Pan, Hongfeng Yu',
    year: 2023,
    why: 'A recent browser-oriented performance reference showing how bundling can be structured for interactive WebGL workflows.',
    link: 'https://doi.org/10.1109/BigData59044.2023.10386295'
  },
  archambault2024: {
    id: 'archambault2024',
    title: 'Bundling-Aware Graph Drawing',
    authors: 'Daniel Archambault, Giuseppe Liotta, Martin Nöllenburg, Tommaso Piselli, Alessandra Tappini, Markus Wallinger',
    year: 2024,
    why: 'Argues that drawing and bundling should co-evolve rather than treating bundling as a purely post hoc effect.',
    link: 'https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.GD.2024.15'
  },
  pahr2025: {
    id: 'pahr2025',
    title: 'NODKANT: Exploring Constructive Network Physicalization',
    authors: 'Daniel Pahr, Sara Di Bartolomeo, Henry Harteveld, Christof Körner, Wolfgang Aigner, Silvia Miksch, Ulrik Brandes',
    year: 2025,
    why: 'A strong recent anchor for network physicalization and constructive interaction beyond flat on-screen viewing.',
    link: 'https://doi.org/10.1111/cgf.70140'
  },
  nemzer2018: {
    id: 'nemzer2018',
    title: 'Data Visualization and 3D-Printing',
    authors: 'Louis R. Nemzer',
    year: 2018,
    why: 'A concise physicalization review that is useful for framing fabrication choices and their practical constraints.',
    link: 'https://scholars.nova.edu/en/publications/data-visualization-and-3d-printing-2/'
  }
};

export const METHOD_LIBRARY = [
  {
    id: 'straight',
    name: 'Straight inspection',
    family: 'baseline',
    status: 'baseline',
    intuition: 'Render the original edges directly with no route sharing.',
    strengths: 'Fastest possible view, preserves exact topology, essential for debugging and sparse graphs.',
    weaknesses: 'High clutter for dense networks and limited structural abstraction.',
    tradeoffs: 'Zero bundling distortion but worst clutter performance.',
    params: ['samples'],
    references: [],
    sourceBadge: 'Baseline'
  },
  {
    id: 'arc',
    name: 'Arc lift',
    family: 'geometric',
    status: 'existing',
    intuition: 'Insert one elevated control point between edge endpoints to improve separation and spatial legibility.',
    strengths: 'Fast and visually elegant in 3D scenes, especially for presentations and light datasets.',
    weaknesses: 'Not a true bundle optimizer and does not discover shared corridors.',
    tradeoffs: 'Good aesthetic lift with low compute cost but limited structural aggregation.',
    params: ['samples', 'lift'],
    references: ['holten2006'],
    sourceBadge: 'Inspired by spline bundling'
  },
  {
    id: 'hub',
    name: 'Hub corridor',
    family: 'routing',
    status: 'existing',
    intuition: 'Re-route edges through high-importance hubs to expose corridor structure around influential nodes.',
    strengths: 'Useful when hub mediation is analytically meaningful and for lecture-style demonstrations.',
    weaknesses: 'Can overstate hub dominance and depends heavily on degree structure.',
    tradeoffs: 'Interpretably biased toward central nodes rather than purely geometric similarity.',
    params: ['samples', 'hubCount', 'lift'],
    references: ['archambault2024'],
    sourceBadge: 'Routing-oriented'
  },
  {
    id: 'legacy',
    name: 'Graph route',
    family: 'path-based',
    status: 'existing',
    intuition: 'Seek alternate paths through the graph itself and draw edges as softened route-following splines.',
    strengths: 'Reveals topological detours and often highlights mediating graph structure.',
    weaknesses: 'Can inflate routes substantially and is sensitive to graph density.',
    tradeoffs: 'Topology-aware but computationally heavier than simple geometric methods.',
    params: ['samples', 'detourCap', 'exponent'],
    references: ['archambault2024'],
    sourceBadge: 'Path bundling'
  },
  {
    id: 'kde',
    name: 'KDE flow field',
    family: 'density-based',
    status: 'new',
    intuition: 'Approximate image-based density bundling by advecting edge samples along a smoothed density field.',
    strengths: 'Produces strong flow-like bundles and works well as a browser-friendly large-graph approximation.',
    weaknesses: 'Introduces geometric distortion and depends on grid resolution and iteration count.',
    tradeoffs: 'Excellent clutter reduction for medium/large graphs but less faithful to individual edge geometry.',
    params: ['samples', 'iterations', 'strength', 'grid'],
    references: ['hurter2012', 'lhuillier2017', 'wu2023'],
    sourceBadge: 'Inspired by KDEEB / PBEB'
  },
  {
    id: 'mingle',
    name: 'Agglomerative spine',
    family: 'multilevel',
    status: 'new',
    intuition: 'Cluster edges by midpoint and direction, then route them through shared corridor spines.',
    strengths: 'Stable, interpretable corridors and good performance for comparison experiments.',
    weaknesses: 'Corridors can feel schematic and may miss fine local variation.',
    tradeoffs: 'Lower ambiguity and better scalability than all-to-all force bundling, at the cost of stylization.',
    params: ['samples', 'clusterCount', 'strength'],
    references: ['gansner2011'],
    sourceBadge: 'MINGLE-inspired approximation'
  },
  {
    id: 'divided',
    name: 'Divided directional lanes',
    family: 'direction-aware',
    status: 'new',
    intuition: 'Build shared routes but reserve opposite lanes on each corridor so direction is preserved.',
    strengths: 'Much better for flow interpretation and directional storytelling than undivided bundles.',
    weaknesses: 'Needs clear source-target semantics and more screen space around bundles.',
    tradeoffs: 'Retains directional semantics but sacrifices some compactness.',
    params: ['samples', 'clusterCount', 'directionSplit', 'strength'],
    references: ['selassie2011'],
    sourceBadge: 'Directional lane bundling'
  },
  {
    id: 'layered',
    name: 'Layer weave',
    family: 'attribute-aware',
    status: 'new',
    intuition: 'Use a categorical node attribute to create layer corridors and weave edges through layer centroids.',
    strengths: 'Excellent when communities, time slices, or relation types should remain visible during bundling.',
    weaknesses: 'Requires a meaningful categorical attribute and can flatten within-layer nuance.',
    tradeoffs: 'Best for semantic layering rather than purely geometric bundling.',
    params: ['samples', 'layerAttr', 'layerGap', 'strength'],
    references: ['bourqui2016'],
    sourceBadge: 'Multilayer-inspired'
  },
  {
    id: 'space3d',
    name: '3D clustered weave',
    family: '3d-specific',
    status: 'new',
    intuition: 'Cluster edges in 3D and lift them through shared depth-aware spines for volumetric scenes.',
    strengths: 'Useful for immersive or sculptural scenes where 2D-only bundling collapses depth structure.',
    weaknesses: 'Harder to read in orthographic projections and more sensitive to camera choice.',
    tradeoffs: 'Best for exhibition and volumetric analysis, not for strict planar readability.',
    params: ['samples', 'clusterCount', 'lift', 'strength'],
    references: ['zielasko2016'],
    sourceBadge: '3D cluster bundling'
  }
];

export function getMethodById(id) {
  return METHOD_LIBRARY.find((method) => method.id === id) || METHOD_LIBRARY[0];
}
