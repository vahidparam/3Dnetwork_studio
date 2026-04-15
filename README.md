# Network Studio

Networks are beautiful.

**Network Studio** is a browser-first visual lab for exploring complex networks from **2D layout** to **3D mapping**, **edge bundling**, **skeleton extraction**, **fabrication preview**, and **export**.

It is designed for researchers, designers, and makers who want to move from analytical network exploration to polished visual outputs and fabrication-ready forms inside a single guided workflow.

## Live Website

**Website:** https://vahidparam.com/3Dnetwork_studio/  

## Video Demo

A full video walkthrough of the studio is available on YouTube:

**YouTube Demo:** `[Watch here](https://youtu.be/A7anDAYFPbA)`

The demo explains:
- how to load and explore a network,
- how to refine the 2D stage before moving to 3D,
- how to apply and compare bundling methods,
- how to extract structure with skeletonization,
- how to prepare physical and fabrication-oriented outputs,
- and how to export scenes and models.

## What the studio does

Network Studio supports:

- graph loading from **GEXF** or **CSV**,
- **2D layout editing** and node refinement,
- **3D mapping** using multiple depth strategies,
- **edge bundling** with method-specific controls,
- **side-by-side comparison** of bundling outputs,
- **skeleton / centerline extraction**,
- **fabrication preview** for physical artifacts,
- **style presets** for scientific and artistic presentation,
- export to visual and geometry formats.

## Core workflow

The studio is organized as a guided single-page pipeline:

1. **Load & 2D**  
   Load a graph, inspect it, and refine the 2D structure.

2. **3D Mapping**  
   Convert the approved 2D structure into depth using attributes, degree, random lift, or globe-style mapping.

3. **Bundle**  
   Apply and tune edge bundling methods to reduce clutter and reveal higher-level flow structure.

4. **Compare & Skeleton**  
   Compare alternative bundling results and extract centerlines from the preferred structure.

5. **Fabricate**  
   Convert graph geometry into fabrication-oriented forms for physical realization.

6. **Style**  
   Apply visual language for scientific figures, artistic scenes, or exhibition-oriented outputs.

7. **Export**  
   Export images, states, and 3D geometry for downstream use.

## Input formats

### GEXF
Best when your graph already contains:
- node positions,
- node size,
- node color,
- metadata.

### CSV
You can also load separate:
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

## Typical use cases

Network Studio is useful when you want to:

- understand dense network structure more clearly,
- compare alternative bundling strategies,
- reveal corridors, trunks, and branch-like patterns,
- create presentation-ready or exhibition-quality visuals,
- prepare networks for fabrication and 3D export.


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


## Demo and walkthrough

The easiest way to understand the full workflow is through the video demo:

**Watch the full walkthrough on YouTube:** `[Watch here](https://youtu.be/A7anDAYFPbA)`

You can also open the live version here:

**Try the studio online:** https://vahidparam.com/3Dnetwork_studio/


## Final note

This studio is built around a simple belief: **networks are not only informative, they are visually rich structures worth exploring as design material**. The same graph can become an analytical figure, a teaching device, an exhibition surface, or a fabricated object. The goal of the studio is to make those transformations understandable and usable.


## Author

**Vahid Param**  
Website: https://vahidparam.com/  
Project page: https://vahidparam.com/3Dnetwork_studio/