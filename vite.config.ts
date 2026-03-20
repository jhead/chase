import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/chase",
  plugins: [react(), wasm()],
  resolve: {
    alias: {
      "@jhead/radish-layer-basemap": path.resolve(__dirname, "plugins/layer-basemap/src"),
      "@jhead/radish-layer-radar-l2": path.resolve(__dirname, "plugins/layer-radar-l2/src"),
      "@jhead/radish-layer-noaa-alerts": path.resolve(__dirname, "plugins/layer-noaa-alerts/src"),
      "@jhead/radish-layer-radar-sites": path.resolve(__dirname, "plugins/layer-radar-sites/src"),
    },
  },
  worker: {
    format: "es",
  },
});
