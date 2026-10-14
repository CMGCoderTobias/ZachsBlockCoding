import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("blockly")) {
              if (id.includes("blockly/core") || id.includes("blockly_compressed") || id.includes("blockly.mjs") || id.includes("core/")) {
                return "blockly-core";
              }
              if (id.includes("blockly/blocks") || id.includes("blocks_compressed") || id.includes("blocks/")) {
                return "blockly-blocks";
              }
              if (id.includes("blockly/javascript") || id.includes("javascript_compressed") || id.includes("generators/javascript") || id.includes("javascript/")) {
                return "blockly-jsgen";
              }
              return "blockly";
            }
            if (id.includes("@babel/parser")) return "babel";
            if (id.includes("@babel")) return "babel-vendor";
          }
        },
      },
    },
  },
});
