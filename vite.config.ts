import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // important for GitHub Pages (subpath hosting)
  base: "./",
});
