// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  // GitHub Pages için: depo adınla aynı base kullan
  // https://<kullanici>.github.io/<REPO_ADI>/
  base: "/balance-log/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    sourcemap: true, // GH Pages'ta sorun çıksa teşhis kolay olsun
  },
});
