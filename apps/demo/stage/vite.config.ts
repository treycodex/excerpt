import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('.'),
  publicDir: here('../../editor/public'),
  plugins: [react()],
  define: { __BUILD__: JSON.stringify('demo stage') },
  server: { port: 5291, strictPort: true, fs: { allow: [here('../../..')] } },
});
