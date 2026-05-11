import process from 'node:process';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendTarget = env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:5001';

  return {
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      strictPort: false,
      proxy: {
        '/api': { target: backendTarget, changeOrigin: true },
        '/socket.io': { target: backendTarget, changeOrigin: true, ws: true },
      },
    },
  };
});
