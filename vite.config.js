import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: "src/index.js",
      name: "MasonryFlow",
      formats: ["es", "iife"],
      fileName: (format) => {
        if (format === "es") return "masonry-flow.es.js";
        if (format === "iife") return "masonry-flow.iife.js";
        if (format === "umd") return "masonry-flow.umd.cjs";
        return `masonry-flow.${format}.js`;
      }
    },
    sourcemap: true,
    minify: "esbuild"
  }
});
