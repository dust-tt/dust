import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [],
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@connectors": path.resolve(__dirname, "./src"),
    },
  },
});
