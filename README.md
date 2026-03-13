# Network3D Studio – revision 2

This revision fixes and extends the browser app in the areas you reported:

- 2D node color mapping now handles:
  - original colors
  - literal colors stored in attributes like `#ff8800` or `rgb(...)`
  - numeric ramps
  - categorical palettes
- added a dedicated **Node size scale** navigator in the 2D stage
- edge mode UI is now dynamic:
  - only relevant controls stay visible per bundling method
  - each method has a tuning/info box
- the **Shortest-path legacy** bundler was rebuilt to actually route through alternate graph paths by excluding the original edge during search
- edge preview remains visible in 2D and 3D stages

## Files

- `index.html`
- `styles/app.css`
- `src/main.js`
- `src/app.js`
- `src/graph.js`
- `src/parsers/gexf.js`
- `src/parsers/csv.js`
- `src/render/scene.js`
- `src/render/nodes.js`
- `src/render/edges.js`
- `src/render/labels.js`
- `src/utils/colors.js`
- `src/utils/math.js`
- `src/workers/layoutWorker.js`
- `src/workers/bundleWorker.js`

## Notes

- The legacy shortest-path bundler is intentionally limited by the point budget on large graphs. That is necessary in-browser.
- For very large graphs, use lower samples and a tighter point budget first.
- If you want the next revision, the highest-value additions are node dragging, community-aware bundling, and progressive file parsing for very large GEXF files.
