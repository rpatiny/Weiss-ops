import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';

/** Versão exibida no app (commit): ajuda a conferir se o deploy publicado é o mais recente. */
const commit = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(commit) },
  // Versão de arquivo único (npm run build:artifact): embute os imports dinâmicos (ex.: xlsx).
  build: process.env.SINGLE_FILE ? { rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
