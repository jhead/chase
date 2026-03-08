import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import wasm from "vite-plugin-wasm";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/chase",
  plugins: [react(), nodePolyfills(), wasm()],
  worker: {
    format: "es",
  },
});
