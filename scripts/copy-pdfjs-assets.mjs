// Copie les ressources de pdf.js (polices standard, cartes de caractères, décodeurs) dans public/pdfjs.
// Elles sont servies par le site lui-même : aucune requête vers un service tiers.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const root = 'node_modules/pdfjs-dist';
mkdirSync('public/pdfjs', { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  if (existsSync(`${root}/${dir}`)) cpSync(`${root}/${dir}`, `public/pdfjs/${dir}`, { recursive: true });
}
console.log('Ressources pdf.js copiées dans public/pdfjs');
