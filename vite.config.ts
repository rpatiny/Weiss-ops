import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Versão de arquivo único (npm run build:artifact): embute os imports dinâmicos (ex.: xlsx).
  build: process.env.SINGLE_FILE ? { rollupOptions: { output: { inlineDynamicImports: true } } } : undefined,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
