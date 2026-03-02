// scripts/copy-demo.mjs
import { mkdir, copyFile } from "node:fs/promises";

await mkdir("docs/assets", { recursive: true });

await copyFile("dist/masonry-flow.iife.js", "docs/assets/masonry-flow.iife.js");
await copyFile("dist/masonry-flow.iife.js.map", "docs/assets/masonry-flow.iife.js.map");
await copyFile("src/masonry.css", "docs/assets/masonry.css");

console.log("Copied demo assets to docs/assets");
