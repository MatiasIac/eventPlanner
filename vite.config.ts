import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react(), {
    name: 'production-content-security-policy',
    apply: 'build',
    // Vite's development refresh preamble needs inline scripts/styles. Only the
    // production HTML receives this policy; framing is denied by HTTP headers.
    transformIndexHtml: () => [{ tag: 'meta', attrs: {
      'http-equiv': 'Content-Security-Policy',
      content: "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'",
    }, injectTo: 'head-prepend' }],
  }],
  server: { port: 5173 },
});
