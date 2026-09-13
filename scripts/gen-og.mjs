import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const out = join(__dirname, '..', 'public', 'og-default.png');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#F7F5EE"/>
  <rect x="0" y="0" width="16" height="630" fill="#0F4C3A"/>
  <rect x="80" y="170" width="40" height="40" rx="9" fill="#0F4C3A"/>
  <text x="100" y="200" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="26" fill="#F7F5EE">v</text>
  <text x="140" y="200" font-family="'JetBrains Mono', monospace" font-size="22" letter-spacing="3" fill="#C4583A">BACKEND ENGINEER</text>
  <text x="78" y="330" font-family="Georgia, serif" font-size="110" font-weight="400" fill="#1A1A17">Venkatesh <tspan fill="#0F4C3A" font-style="italic">Patnala</tspan></text>
  <text x="80" y="400" font-family="Georgia, serif" font-style="italic" font-size="34" fill="#4A4A45">systems &#183; shipping alongside AI &#183; writing it down</text>
  <text x="80" y="540" font-family="'JetBrains Mono', monospace" font-size="26" letter-spacing="2" fill="#0F4C3A">venkyverse.space</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out);
