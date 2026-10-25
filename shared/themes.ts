export const themeIds = ['beach', 'night', 'garden', 'sunset', 'lavender'] as const;
export type ThemeId = typeof themeIds[number];
export const themes: { id: ThemeId; name: string; description: string }[] = [
  { id: 'beach', name: 'Beach', description: 'Warm sand & ocean blue' },
  { id: 'night', name: 'Night', description: 'Midnight & soft starlight' },
  { id: 'garden', name: 'Garden', description: 'Sage & natural linen' },
  { id: 'sunset', name: 'Sunset', description: 'Terracotta & peach' },
  { id: 'lavender', name: 'Lavender', description: 'Lilac & soft cream' },
];
