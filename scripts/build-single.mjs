// Builds dist/ with Vite, then inlines the JS bundle into one self-contained HTML file.
// Output: dist/neon-chomp.html (open it directly, or upload/publish it as a single file).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

execSync('npx vite build', { stdio: 'inherit' });
const jsFile = readdirSync('dist/assets').find(f => f.endsWith('.js'));
const js = readFileSync(`dist/assets/${jsFile}`, 'utf8');
if (js.toLowerCase().includes('</script')) throw new Error('bundle contains </script>; cannot inline safely');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Neon Chomp</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap">
<style>
  :root { color-scheme: dark; }
  html, body { height: 100%; margin: 0; background: #05030d; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  canvas { display: block; touch-action: none; outline: none; }
</style></head><body>
<canvas id="game" tabindex="0" aria-label="Neon Chomp game"></canvas>
<script type="module">
${js}
</script>
</body></html>
`;
writeFileSync('dist/neon-chomp.html', html);
console.log(`dist/neon-chomp.html written (${(html.length / 1024).toFixed(0)} KB)`);
