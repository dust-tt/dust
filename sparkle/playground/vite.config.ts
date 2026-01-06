import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3008,
    open: true,
  },
  resolve: {
    alias: {
      "@dust-tt/sparkle": path.resolve(__dirname, "../src"),
      "@sparkle": path.resolve(__dirname, "../src"),
    },
  },
});

