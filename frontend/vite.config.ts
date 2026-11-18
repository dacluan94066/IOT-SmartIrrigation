import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.BACKEND_PROXY_TARGET || "http://127.0.0.1:3001";
  const proxy = { "/api": { target, changeOrigin: false } };
  return {
    plugins: [react(), tailwindcss()],
    server: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 5173, strictPort: true, proxy },
    build: { sourcemap: false },
  };
});
