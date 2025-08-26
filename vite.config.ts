import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// relative base makes it work on GitHub Pages subpaths
export default defineConfig({
  plugins: [react()],
  base: "./"
});
