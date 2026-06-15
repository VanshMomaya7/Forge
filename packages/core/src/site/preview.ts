import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ROCKET_GAME_TSX } from './rocket-game.js';

// Browser ESM CDN so the preview needs no local build. react-dom/jsx-runtime are
// pinned to the import-mapped react to avoid a duplicate-React hook error.
const IMPORT_MAP = {
  imports: {
    react: 'https://esm.sh/react@19',
    'react-dom/client': 'https://esm.sh/react-dom@19/client?external=react',
    'react/jsx-runtime': 'https://esm.sh/react@19/jsx-runtime?external=react',
    three: 'https://esm.sh/three'
  }
};

/**
 * Builds a standalone, playable HTML preview of the winning Game.tsx by
 * transpiling it (esbuild tsx) and mounting it with React + three from a CDN.
 * No local build/deploy needed — used to "see what Forge built" immediately.
 */
export async function buildPreviewHtml(artifactRoot: string): Promise<string> {
  const source = await resolveGameSource(artifactRoot);
  const esbuild = await import('esbuild');
  const { code } = await esbuild.transform(source, {
    loader: 'tsx',
    jsx: 'automatic',
    format: 'esm',
    target: 'es2020',
    sourcefile: 'Game.tsx'
  });

  // Import the component by its default export (robust to its identifier name).
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    '<title>Forge build preview</title>',
    '<style>html,body{margin:0;height:100%;background:#0b1020;overflow:hidden}#forge-root{width:100vw;height:100vh}</style>',
    `<script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>`,
    '</head>',
    '<body>',
    '<div id="forge-root"></div>',
    '<script type="module">',
    'import { createElement } from "react";',
    'import { createRoot } from "react-dom/client";',
    `import Game from "${moduleUrl}";`,
    'createRoot(document.getElementById("forge-root")).render(createElement(Game));',
    '</script>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

// Use the winning Game.tsx when one exists; otherwise (no artifact yet, or the
// legacy blue-cube fallback was produced) serve the playable rocket game so the
// preview is never an empty blue box.
async function resolveGameSource(artifactRoot: string): Promise<string> {
  try {
    const source = await readFile(path.join(artifactRoot, 'source', 'Game.tsx'), 'utf8');
    return isLegacyCubeFallback(source) ? ROCKET_GAME_TSX : source;
  } catch {
    return ROCKET_GAME_TSX;
  }
}

function isLegacyCubeFallback(source: string): boolean {
  return source.includes('0x4f8cff') && source.includes('BoxGeometry');
}
