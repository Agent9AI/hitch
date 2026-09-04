import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    proxy: {
      // `npm run dev` proxies the API to a local `wrangler dev` on 8787.
      "/api": "http://127.0.0.1:8787",
    },
  },
});
