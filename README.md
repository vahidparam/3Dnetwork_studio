# Network3D Studio

Network3D Studio is a browser-first tool for turning network data into an editable 2D layout, mapping it into 3D, and then drawing or bundling edges for presentation-quality scenes.

It is designed to run as a static GitHub Pages app. No backend is required.

## Supported input

- GEXF (`.gexf` / `.xml`)
- Nodes CSV + edges CSV

Nodes CSV should include `id` and can also include `label`, `x`, `y`, `z`, `size`, `color`, plus any other attributes.

Edges CSV should include `source`, `target`, and optionally `weight`.

## Workflow

### 1. Input
Upload either a GEXF file or a pair of nodes / edges CSV files, then click **Load graph**.

### 2. 2D Layout
Choose a layout source, adjust scaling, size, color, and ForceAtlas2 settings, then click **Apply 2D**.

New in this build:
- drag nodes directly in 2D
- pinned-node editing
- saved pins are respected in later ForceAtlas2 runs

### 3. 3D Mapping
Choose how depth is assigned:
- flat
- original z
- random
- degree / weighted degree
- any numeric or categorical attribute

### 4. Edge Bundling
Choose a technique and tune it:
- Straight
- Arc
- Hub bundle
- Shortest-path legacy

## Extra tools

### Filters
Use the filter panel to limit the visible graph by:
- a categorical attribute (community, group, cluster, etc.)
- a numeric range

### Presets

### Legend
The legend is generated automatically from the current node color and size encodings.

### Hover + selection
- Hover a node to see a tooltip and highlight its local neighborhood.
- Click a node to open a details panel.

## Design tips

- Start in 2D and get spacing, color, and size right before moving into 3D.
- For large graphs, use filters first. Then bundle only the visible subgraph.
- Use categorical color for communities and numeric size for centrality or activity.
- Keep 3D depth meaning consistent. Do not mix unrelated metrics into the same scene unless you explain them in the legend.
- For publication-style exports, use transparent PNG or SVG.


