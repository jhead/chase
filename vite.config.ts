import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/chase",
  plugins: [react(), nodePolyfills(), wasm()],
  resolve: {
    alias: {
      "@chase/layer-basemap": path.resolve(__dirname, "plugins/layer-basemap/src"),
      "@chase/layer-radar-l2": path.resolve(__dirname, "plugins/layer-radar-l2/src"),
      "@chase/layer-noaa-alerts": path.resolve(__dirname, "plugins/layer-noaa-alerts/src"),
      "@chase/layer-radar-sites": path.resolve(__dirname, "plugins/layer-radar-sites/src"),
    },
  },
  worker: {
    format: "es",
  },
});
