// Original geometric illustrations for this application. No third-party artwork.
import { mkdirSync, writeFileSync } from 'node:fs';
const drawings = {
  rings: '<circle cx="37" cy="52" r="16"/><circle cx="59" cy="52" r="16"/><path d="m48 24 5 7-5 7-5-7zM43 31h10"/>',
  flowers: '<path d="m35 75 13-31 13 31M39 74h18M48 58c-17-1-20-9-21-15 12 1 19 5 21 15M49 65c17-2 21-9 22-15-12 1-20 6-22 15"/><path d="M48 38c-15 7-19-3-11-9-4-11 8-15 11-5 6-10 17-6 12 4 10 6 5 17-12 10Z"/>',
  photographs: '<rect x="22" y="34" width="52" height="36" rx="7"/><path d="m35 34 4-8h18l4 8"/><circle cx="48" cy="52" r="12"/><circle cx="65" cy="42" r="2"/><path d="M42 52a6 6 0 0 1 6-6"/>',
  drinks: '<path d="m24 24 24 4-3 20c-2 13-25 9-23-4zM32 55l-3 18M21 72l16 3M51 28l22-4 3 20c2 13-20 17-23 4zM66 55l3 18M61 75l16-3M24 38l22 4M53 42l21-4"/>',
  food: '<circle cx="48" cy="49" r="21"/><circle cx="48" cy="49" r="14"/><path d="M17 25v23m-5-23v15c0 8 10 8 10 0V25M17 48v25M79 25c-9 9-9 26 0 26V25Zm0 26v22"/>',
  speeches: '<rect x="39" y="20" width="18" height="36" rx="9"/><path d="M31 44v4c0 23 34 23 34 0v-4M48 66v12M36 78h24M44 29h8M44 36h8M44 43h8"/>',
  cake: '<path d="M24 75V52h48v23M32 52V35h32v17M20 75h56M32 40c4 8 9 8 16 0 7 8 12 8 16 0M24 58c4 9 11 9 16 0 4 9 12 9 16 0 4 9 12 9 16 0M48 35v-8"/><path d="M48 27c-9-2-5-9 0-13 5 4 9 11 0 13Z"/>',
  music: '<path d="M37 65V30l30-7v35M37 39l30-7"/><ellipse cx="28" cy="66" rx="9" ry="7"/><ellipse cx="58" cy="59" rx="9" ry="7"/><path d="m19 24 2-5 2 5 5 2-5 2-2 5-2-5-5-2z"/>',
  transport: '<path d="m24 45 7-17h34l8 17M23 45h50v22H23zM31 28l-3 17M65 28l4 17M23 52h50M35 45h26"/><circle cx="33" cy="67" r="6"/><circle cx="63" cy="67" r="6"/><path d="M29 57h7M61 57h7"/>',
  leaf: '<path d="M28 75c22-20 26-33 39-53M37 65C17 60 19 44 19 44c18 0 23 8 18 21ZM46 52c20 4 29-10 29-10-18-7-26-2-29 10ZM51 42C31 37 34 22 34 22c16 1 22 8 17 20ZM59 31c-2-15 11-19 17-19 0 14-4 20-17 19Z"/>',
};
mkdirSync('public/illustrations', { recursive: true });
for (const [name, paths] of Object.entries(drawings)) {
  writeFileSync(`public/illustrations/${name}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="20" fill="#e8ecdf"/><g fill="none" stroke="#61775a" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>\n`);
}
