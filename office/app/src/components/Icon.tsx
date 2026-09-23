/** Stroke icon set (24×24, 1.8px). Decorative by default; pass `label` to expose to screen readers. */
const P: Record<string, string> = {
  dashboard: 'M4 4h7v8H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  house: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  agent: 'M9 3h6M12 3v3M6 6h12a2 2 0 012 2v9a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2zM9 12h.01M15 12h.01M9 16h6',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
  tasks: 'M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  file: 'M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5M9 13h6M9 17h4',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  plus: 'M12 5v14M5 12h14',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0',
  x: 'M6 6l12 12M18 6L6 18',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  sort: 'M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  alert: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  hand: 'M8 13V5a1.5 1.5 0 013 0v6M11 11V4a1.5 1.5 0 013 0v7M14 11V6a1.5 1.5 0 013 0v7c0 4-2 8-7 8-3 0-5-2-6-5l-1-3a1.5 1.5 0 012.5-1.5L8 13',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  moon: 'M20 14A8 8 0 1110 4a6 6 0 0010 10z',
  check: 'M5 12l5 5 9-10',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
  refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
  keyboard: 'M3 7h18v10H3zM7 11h.01M11 11h.01M15 11h.01M7 14h10',
  note: 'M5 4h14v12l-4 4H5zM15 16v4M15 16h4M9 9h6M9 12h4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 17a5 5 0 100-10 5 5 0 000 10zM12 13a1 1 0 100-2 1 1 0 000 2z',
  dollar: 'M12 3v18M16 7a4 3 0 00-4-2c-2.2 0-4 1.3-4 3s1.8 3 4 3 4 1.3 4 3-1.8 3-4 3a4 3 0 01-4-2',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7h.01',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  minus: 'M5 12h14',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  play: 'M7 5l12 7-12 7z',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
};

export function Icon({ name, size = 18, label, className = '', strokeWidth = 1.8 }: { name: keyof typeof P | string; size?: number; label?: string; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 ${className}`} aria-hidden={label ? undefined : true} role={label ? 'img' : undefined} aria-label={label}>
      <path d={P[name] ?? P.info} />
    </svg>
  );
}
