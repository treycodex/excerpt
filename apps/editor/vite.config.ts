import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Stamped into the bundle so the running build is visible. A stale bundle served
// from memory cost three test cycles before this existed.
// Node's env, typed here rather than pulling in @types/node for one read.
declare const process: { env: Record<string, string | undefined> };

const BUILD = new Date().toISOString().replace('T', ' ').slice(0, 16);

// `base: './'` so the same build works from a web server and from a file:// URL
// inside the Mac app's WKWebView. Absolute /assets paths resolve to the filesystem
// root there and silently load nothing.
export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'bundled-editor-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const policy = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
        return html.replace('<meta name="viewport"',
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="viewport"`);
      },
    },
  }],
  define: { __BUILD__: JSON.stringify(BUILD) },
  // The website also defaults to 5273; a launcher that assigns PORT runs both at once.
  server: { port: Number(process.env.PORT) || 5273 },
});
