import tailwindcss from "@tailwindcss/postcss";
import vinext from "vinext";
import { defineConfig } from "vite";
export default defineConfig({
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    host: "127.0.0.1",
    port: 8791,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8790", changeOrigin: true },
      "/media": { target: "http://127.0.0.1:8790", changeOrigin: true },
    },
  },
  plugins: [vinext()],
});
