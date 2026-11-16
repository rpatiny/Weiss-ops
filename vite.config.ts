import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Versão exibida no app (commit): ajuda a conferir se o deploy publicado é o mais recente. */
const commit = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'dev';
  }
})();

const semver = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __APP_VERSION__: JSON.stringify(commit), __APP_SEMVER__: JSON.stringify(semver), __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  // Versão de arquivo único (npm run build:artifact): embute os imports dinâmicos (ex.: xlsx).
  build: process.env.SINGLE_FILE ? { assetsInlineLimit: 100_000_000, rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
