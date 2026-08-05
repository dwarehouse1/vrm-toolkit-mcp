import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: [join(root, "src/page/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: join(dist, "renderer.js"),
  logLevel: "warning",
});

writeFileSync(
  join(dist, "renderer.html"),
  [
    "<!doctype html>",
    '<html lang="en">',
    '<head><meta charset="utf-8"><title>vrm-toolkit renderer</title>',
    "<style>html,body{margin:0;padding:0;background:#eef0f4;}canvas{display:block;}</style></head>",
    '<body><canvas id="stage"></canvas><script src="./renderer.js"></script></body>',
    "</html>",
    "",
  ].join("\n"),
);
console.log("renderer bundle written to dist/renderer.js");
