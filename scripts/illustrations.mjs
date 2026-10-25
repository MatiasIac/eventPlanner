// Original geometric illustrations for this application. No third-party artwork.
import { mkdirSync, writeFileSync } from 'node:fs';
const drawings = {
  sun: '<circle cx="48" cy="48" r="17"/><path d="M48 14v9m0 50v9M14 48h9m50 0h9M24 24l7 7m34 34 7 7M24 72l7-7m34-34 7-7"/>',
  waves: '<path d="M15 36c11-17 22 17 33 0s22 17 33 0M15 49c11-17 22 17 33 0s22 17 33 0M15 62c11-17 22 17 33 0s22 17 33 0"/>',
  palm: '<path d="M45 79c8-21 13-35 10-49M55 30c-14-17-31-11-36 5 16-8 26-4 36-5Zm0 0c8-19 25-13 28 2-12-6-19-5-28-2Zm0 0c-15 0-24 11-20 25 5-12 11-17 20-25Zm0 0c11-2 21 12 17 25-3-11-8-18-17-25ZM28 80h42"/>',
  shell: '<path d="M41 75 18 45C4 20 40 9 48 26c8-17 44-6 30 19L55 75ZM48 26v49M30 25l14 50M66 25 52 75M21 39l21 36M75 39 54 75M40 75h16v7H40Z"/>',
  moon: '<path d="M65 17a31 31 0 1 0 14 53A32 32 0 0 1 65 17Z"/><path d="m74 27 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z"/>',
  stars: '<path d="m37 17 7 17 18 1-14 12 5 18-16-10-16 10 5-18-14-12 18-1ZM72 16l3 8 9 2-9 3-3 9-3-9-9-3 9-2ZM69 56l4 10 11 2-11 4-4 11-4-11-11-4 11-2Z"/>',
  coffee: '<path d="M22 36h43v22c0 24-43 24-43 0ZM65 40h7c18 0 13 22-7 22M17 79h58M32 26c-9-7 9-10 0-17M45 26c-9-7 9-10 0-17M58 26c-9-7 9-10 0-17"/>',
  tables: '<path d="M15 35h66v12H15ZM23 47v30M73 47v30M29 47v30M67 47v30M18 77h16M62 77h16"/><path d="M41 35V24h14v11M48 24V14"/>',
  chairs: '<path d="M29 21h38v34H29zM24 55h48v10H24zM29 65v17M67 65v17M35 27v21M48 27v21M61 27v21"/>',
  gift: '<path d="M20 44h56v36H20ZM16 33h64v11H16ZM43 33h10v47M48 33C13 33 25 5 39 18l9 15Zm0 0C83 33 71 5 57 18Z"/>',
  heart: '<path d="M48 78 19 49C-4 26 29 5 48 28 67 5 100 26 77 49Z"/>',
  clock: '<circle cx="48" cy="48" r="31"/><path d="M48 28v22l14 9M48 17v6M48 73v6M17 48h6M73 48h6"/>',
  walk: '<circle cx="55" cy="20" r="7"/><path d="m50 33-13 9-9 16M50 33l10 16 13 5M50 33l-7 26 17 19M43 59 29 79"/>',
  games: '<rect x="19" y="19" width="58" height="58" rx="12"/><circle cx="34" cy="34" r="3"/><circle cx="62" cy="34" r="3"/><circle cx="48" cy="48" r="3"/><circle cx="34" cy="62" r="3"/><circle cx="62" cy="62" r="3"/>',
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
