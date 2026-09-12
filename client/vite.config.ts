import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
    // A single intentional bundle exceeds the default 500 kB warning threshold.
    chunkSizeWarningLimit: 1024,
    // Disabling code splitting emits one self-contained JS file.
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  server: {
    proxy: {
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
});
