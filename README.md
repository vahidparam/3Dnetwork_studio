# Network Studio

Networks are beautiful.

Network Studio is a browser-first visual lab for understanding complex networks, turning them into clearer analytical views, and pushing them toward artistic and fabrication-ready forms. The studio is designed for people who want to move fluidly between **analysis**, **aesthetic exploration**, and **physical making**.

It supports:
- graph loading and 2D editing,
- 3D mapping including a sapphire globe view,
- literature-aware edge bundling,
- skeleton / centerline abstraction,
- styling for scientific and artistic scenes,
- fabrication preview and export.

The app is static and deployable on GitHub Pages, Netlify, Vercel static hosting, or any ordinary web server.

---

## What this studio is for

Use the studio when you want to:
- visually understand dense connectivity patterns,
- compare bundling strategies instead of trusting a single view,
- reveal trunks, corridors, and branch structures,
- turn networks into exhibition graphics or design material,
- prototype physical artifacts for 3D printing.

The main idea is simple: **good visual transformations can help people see networks better**. The same network can be read as topology, flow, corridor structure, material, or sculpture depending on the transformation pipeline.

---

## Workflow

The studio is organized as a single-page guided workflow:
1. **Load & 2D** — load a graph, inspect it, edit node positions, settle the readable 2D layout.
2. **3D mapping** — map the approved 2D structure into depth using attributes, degree, random lift, or globe.
3. **Bundle** — choose a bundling family and tune only the parameters that matter for that method.
4. **Compare & skeleton** — compare two methods side by side, then extract centerlines from the preferred result.
5. **Fabricate** — convert raw/bundled/skeleton layers into printable rods, joints, and support geometry.
6. **Style** — turn the network into a scientific or artistic material language.
7. **Export** — export PNG, SVG, JSON state, STL, OBJ, or GLB as appropriate.

### Reading the viewport
- **Selection** highlights a chosen node, its immediate neighbors, and the connecting edges.
- **Scene tools** keeps visible layers, labels, nodes, and background under quick control.
- **Details** opens a compact popup with overview metrics, bundle metrics, and layer state.

---

## How to work with the studio

### A practical analysis flow
1. Load a graph or start with the demo atlas.
2. Refine the 2D layout until major regions are readable.
3. Apply a 3D mapping only after the 2D stage feels stable.
4. Compare bundling methods in draft or interactive quality.
5. Use the skeleton stage when you want cleaner corridors or print-ready trunks.
6. Move to styling only after structure is settled.
7. Export the scene or a fabrication model.

### A practical art / design flow
1. Start from a graph with interesting topology.
2. Use bundling to exaggerate flow or corridor structure.
3. Extract a skeleton if you want a trunk-and-branch language.
4. Move to style and experiment with metallic wire, neon fiber, glass strands, or print-like monochrome previews.
5. Export high-resolution images or build physical previews for printed artifacts.

---

## Input formats

### GEXF
Best when your graph already contains:
- node positions,
- size,
- color,
- metadata.

### CSV
You can also load:
- **nodes CSV**
- **edges CSV**

Recommended node columns:
- `id`
- `label`
- `x`, `y`, optional `z`
- `size`
- `color`
- extra attributes

Recommended edge columns:
- `source`
- `target`
- optional `weight`
- extra attributes

Column matching is case-insensitive.

---

## Performance strategy

The studio is built for browser use, so it favors fast visual iteration over pretending that every algorithm is fully offline-grade inside the UI.

### In-browser strategy
- worker-backed layout and bundling,
- quality presets (`draft`, `interactive`, `high`, `export`),
- cached bundle states keyed by layout + method + parameters,
- low-cost line rendering for exploration,
- optional solid preview only when needed,
- explicit invalidation of stale bundle / skeleton / fabrication layers when the layout changes.

### Recommended use
- Use **draft** or **interactive** while exploring.
- Use **high** for presentation-quality scenes.
- Use **export** only for final screenshots or heavier preview states.

### Practical limitation
Very large graphs may still require:
- subsetting,
- imported precomputed bundles,
- or offline processing for the heaviest cases.

---

## Fabrication workflow

The strongest fabrication path is usually:

**raw graph → bundle → skeleton → fabrication preview → STL / OBJ / GLB**

### More robust prints usually need
- skeleton or simplified bundle sources,
- thicker minimum radius,
- a base plate or relief mode,
- caution with very dense raw bundles,
- and node solids chosen for printability and readability.

### Node solids
The fabrication step can assign printable node shapes in three ways:
- one shared shape for all nodes,
- categorical shape mapping from a node attribute,
- or shape mapping from the current node colors.

This is useful when you want communities, roles, or other categories to remain legible in a printed object without relying only on color.

### Printability notes
The current printability checks are heuristic. They warn about:
- small radius,
- very slender segments,
- overly dense source geometry.

Always validate the exported model in a slicer or modeling tool before printing.

---

## Methods and papers

The studio is literature-aware. The UI surfaces method cards and reference badges, and the links below point to the main papers behind the implemented or approximated method families.

### Bundling foundations
- **Hierarchical Edge Bundles** — Danny Holten, 2006  
  https://www.cs.jhu.edu/~misha/ReadingSeminar/Papers/Holten06.pdf  
  Applied here as the conceptual basis for curved shared-routing views and the lightweight **Arc lift** method.

- **Force-Directed Edge Bundling for Graph Visualization** — Danny Holten, Jarke J. van Wijk, 2009  
  https://doi.org/10.1111/j.1467-8659.2009.01450.x  
  Used as a core reference for self-organizing bundle thinking and parameter interpretation.

### Density / image-space / scalable bundling
- **Image-Based Edge Bundles** — Alexandru Telea, Ozan Ersoy, 2010  
  https://webspace.science.uu.nl/~telea001/uploads/PAPERS/EuroVis10/paper.pdf  
  Important for the bundle-to-structure transition and skeleton thinking.

- **Graph Bundling by Kernel Density Estimation** — Christophe Hurter, Ozan Ersoy, Alexandru Telea, 2012  
  https://doi.org/10.1111/j.1467-8659.2012.03079.x  
  Applied in the **KDE flow field** approximation and density-aware corridor extraction.

- **FFTEB: Edge Bundling of Huge Graphs by the Fast Fourier Transform** — Antoine Lhuillier, Christophe Hurter, Alexandru Telea, 2017  
  https://doi.org/10.1109/PACIFICVIS.2017.8031594  
  Used as a performance reference for browser-friendly large-graph bundling ideas.

- **Accelerating Web-based Graph Visualization with Pixel-Based Edge Bundling** — Jieting Wu et al., 2023  
  https://doi.org/10.1109/BigData59044.2023.10386295  
  Used as a recent reference for web deployment and fast pixel-based bundling workflows.

### Multilevel / path / layered / directional methods
- **Multilevel Agglomerative Edge Bundling** — Emden R. Gansner et al., 2011  
  https://doi.org/10.1109/PACIFICVIS.2011.5742389  
  Applied in the **Agglomerative spine** approximation.

- **Divided Edge Bundling for Directional Network Data** — David Selassie, Brandon Heller, Jeffrey Heer, 2011  
  https://doi.org/10.1109/TVCG.2011.190  
  Applied in **Divided directional lanes**.

- **Multilayer Graph Edge Bundling** — Romain Bourqui et al., 2016  
  https://doi.org/10.1109/PACIFICVIS.2016.7465267  
  Applied in **Layer weave** for attribute-aware routing.

- **Bundling-Aware Graph Drawing** — Daniel Archambault et al., 2024  
  https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.GD.2024.15  
  Used as a design reminder that layout and bundling should be considered together, not as unrelated steps.

### Skeleton and structure abstraction
- **Skeleton-Based Edge Bundling for Graph Visualization** — Ozan Ersoy et al., 2011  
  https://doi.org/10.1109/TVCG.2011.233  
  Applied in the centerline / trunk-and-branch abstraction stage.

### 3D bundling and physicalization
- **Interactive 3D Force-Directed Edge Bundling** — Daniel Zielasko et al., 2016  
  https://doi.org/10.1111/cgf.12881  
  Applied as the conceptual basis for the volumetric **3D clustered weave** direction.

- **Data Visualization and 3D-Printing** — Louis R. Nemzer, 2018  
  https://scholars.nova.edu/en/publications/data-visualization-and-3d-printing-2/  
  Used to frame fabrication choices and practical print constraints.

- **NODKANT: Exploring Constructive Network Physicalization** — Daniel Pahr et al., 2025  
  https://doi.org/10.1111/cgf.70140  
  Used as a key recent reference for taking networks beyond flat screens and toward constructive physical artifacts.

### Evaluation
- **An Information-Theoretic Framework for Evaluating Edge Bundling Visualization** — Xin Liu, Jieting Wu, Feiyu Zhu, Hongfeng Yu, 2018  
  https://doi.org/10.3390/e20090625  
  Motivates the comparison board and bundle-quality summaries.

---


## Final note

This studio is built around a simple belief: **networks are not only informative, they are visually rich structures worth exploring as design material**. The same graph can become an analytical figure, a teaching device, an exhibition surface, or a fabricated object. The goal of the studio is to make those transformations understandable and usable.
