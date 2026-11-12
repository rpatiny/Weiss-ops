/**
 * Gera uma versão de ARQUIVO ÚNICO do app (CSS + JS embutidos) em dist-artifact/spindleops.html,
 * para publicação como página hospedada (ex.: Artifact do Claude), onde só scripts de CDNs
 * permitidas podem ser carregados externamente.
 * Uso: npm run build:artifact
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module" crossorigin src="\/(assets\/[^"]+\.js)"/)?.[1];
const css = html.match(/<link rel="stylesheet" crossorigin href="\/(assets\/[^"]+\.css)"/)?.[1];
if (!js || !css) throw new Error('Assets não encontrados em dist/index.html — rode `vite build` antes.');

const jsCode = readFileSync(join(dist, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const cssCode = readFileSync(join(dist, css), 'utf8');

const page = `<title>SpindleOps</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<script>
  // Tema: preferência salva > tema do visualizador (data-theme) > sistema.
  (function () {
    var t = null;
    try { t = localStorage.getItem('spindleops:theme'); } catch (e) {}
    var host = document.documentElement.getAttribute('data-theme');
    var dark = t ? t === 'dark' : host ? host === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  })();
</script>
<style>${cssCode}</style>
<div id="root"></div>
<script type="module">${jsCode}</script>
`;

mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/spindleops.html', page);
console.log(`dist-artifact/spindleops.html (${(page.length / 1024).toFixed(0)} kB)`);
