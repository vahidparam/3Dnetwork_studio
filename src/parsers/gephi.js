import JSZip from 'https://esm.sh/jszip@3.10.1';
import { parseGexfText } from './gexf.js';

function decodeText(buffer) {
  return new TextDecoder('utf-8').decode(buffer);
}

async function tryReadAsZip(file) {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  const preferred = entries
    .filter((entry) => /\.gexf$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of preferred) {
    const text = await entry.async('text');
    if (/<gexf[\s>]/i.test(text)) return parseGexfText(text);
  }

  for (const entry of entries.filter((entry) => /\.(xml|txt|gephi)$/i.test(entry.name))) {
    const text = await entry.async('text');
    if (/<gexf[\s>]/i.test(text)) return parseGexfText(text);
  }

  throw new Error('This .gephi project could not be converted in-browser. Export the graph from Gephi as .gexf and load that file instead.');
}

export async function parseGephiProjectFile(file) {
  try {
    return await tryReadAsZip(file);
  } catch (zipError) {
    try {
      const text = await file.text();
      if (/<gexf[\s>]/i.test(text)) return parseGexfText(text);
      throw new Error('This .gephi project format is not directly readable here. Export it from Gephi as .gexf to preserve size, color, and layout attributes.');
    } catch {
      throw zipError instanceof Error ? zipError : new Error('Unable to read the .gephi project file.');
    }
  }
}
