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

Use the **×** buttons next to each file input to remove the uploaded file and clear the current scene.

### 2. 2D Layout
Choose a layout source, adjust scaling, styling, and ForceAtlas2 settings, then click **Apply 2D**.

In this step:
- drag nodes directly in 2D
- moved nodes stay fixed in later ForceAtlas2 runs
- node size and color updates should appear immediately
- sections are collapsible so the sidebar stays compact

Selection behavior:
- hover shows a tooltip and neighborhood highlight
- hold **Ctrl** on Windows/Linux or **⌘** on macOS and click to select a node

### 3. 3D Mapping
Choose how depth is assigned:
- flat
- original z
- random
- degree / weighted degree
- any numeric or categorical attribute
- globe mapping

### 4. Edge Bundling
Choose a technique and tune it:
- Straight
- Arc
- Hub bundle
- Shortest-path legacy

## Extra tools

### Legend
The legend is generated automatically from the current node color and size encodings.

### Help buttons
Each major step includes a small **?** help button. Use it to read short guidance about layout controls, 3D mapping, bundling, and performance settings such as point budget.

### Node details
When a node is selected with **Ctrl/⌘ + click**, a details panel opens at the top of the viewport.

## Design tips

- Start in 2D and get spacing, color, and size right before moving into 3D.
- Use original positions only when the imported graph already has a good layout.
- Use categorical color for communities and numeric size for centrality or activity.
- Keep 3D depth meaning consistent. Do not mix unrelated metrics into the same scene unless you explain them in the legend.
- For publication-style exports, use transparent PNG or SVG.
- If bundling becomes slow, reduce curve samples or point budget.
