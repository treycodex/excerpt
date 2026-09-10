import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Stamped into the bundle so the running build is visible. A stale bundle served
// from memory cost three test cycles before this existed.
const BUILD = new Date().toISOString().replace('T', ' ').slice(0, 16);

export default defineConfig({
  plugins: [react()],
  define: { __BUILD__: JSON.stringify(BUILD) },
  server: { port: 5273 },
});
