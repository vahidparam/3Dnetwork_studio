# Network Studio

**Network Studio** is a browser-first visual lab for exploring complex networks from **2D layout** to **3D mapping**, **edge bundling**, **skeleton extraction**, **fabrication preview**, and **export**.

It is designed for researchers, designers, and makers who want to move from analytical network exploration to polished visual outputs and fabrication-ready forms inside a single guided workflow.

## Live Website

**Website:** https://vahidparam.com/3Dnetwork_studio/  
**Repository:** https://github.com/vahidparam/3Dnetwork_studio

## Video Demo

A full video walkthrough of the studio is available on YouTube:

**YouTube Demo:** `https://youtu.be/A7anDAYFPbA`

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

## Demo and walkthrough

The easiest way to understand the full workflow is through the video demo:

**Watch the full walkthrough on YouTube:** `PASTE_YOUR_YOUTUBE_VIDEO_LINK_HERE`

You can also open the live version here:

**Try the studio online:** https://vahidparam.com/3Dnetwork_studio/

## Citation / attribution

If you use or reference this project in academic, design, or exhibition work, please link to:

- Repository: https://github.com/vahidparam/3Dnetwork_studio
- Website: https://vahidparam.com/3Dnetwork_studio/

## Author

**Vahid Param**  
Website: https://vahidparam.com/  
Project page: https://vahidparam.com/3Dnetwork_studio/