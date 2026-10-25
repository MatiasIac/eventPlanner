export type IconName = 'edit' | 'archive' | 'withdraw' | 'check' | 'refresh' | 'user';
const paths: Record<IconName, string> = {
  edit: 'M16 3l5 5M3 21l5-1L21 7a2 2 0 0 0-5-5L3 15v6Z',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M9 12h6',
  withdraw: 'M15 8a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM3 21v-2a6 6 0 0 1 10-4M16 17h6',
  check: 'm5 12 4 4L20 5',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 2M4 17l2 2a8 8 0 0 0 13-3',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 22v-3a8 8 0 0 1 16 0v3',
};
export function Icon({ name }: { name: IconName }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
