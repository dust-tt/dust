import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4001,
    proxy: {
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
      },
      "/message": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
