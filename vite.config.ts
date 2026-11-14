import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // PDF.js targets current browsers; WebView2 is evergreen, so no down-leveling.
  build: { target: "esnext", chunkSizeWarningLimit: 2500 },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
