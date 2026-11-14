const PATHS = {
  gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 21V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  back: 'M19 12H5m6-6-6 6 6 6',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  volume: 'm11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14',
  muted: 'm11 4-6 5H2v6h3l6 5ZM16 9l6 6M22 9l-6 6',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  code: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8',
  refresh: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
  play: 'm8 5 11 7-11 7Z',
  x: 'M18 6 6 18M6 6l12 12',
  expand: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  user: 'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  check: 'm5 12 4 4L19 6',
  forward: 'M5 12h14m-6-6 6 6-6 6',
  lotto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM10.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM16.5 10.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM13 15.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z',
  cards: 'M3 8h11v13H3zM8 4.5 19 3l2 13-6 .8',
  survival: 'M4 4h4v4H4zM10 4h4v4h-4zM16 4h4v4h-4zM4 10h4v4H4zM10 10h4v4h-4zM16 10h4v4h-4zM4 16h4v4H4zM10 16h4v4h-4zM16 16h4v4h-4z',
  pause: 'M8 5v14M16 5v14',
  auto: 'm3 5 8 7-8 7zM13 5l8 7-8 7z',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0v1.5m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5-2.7L4.2 15a1.6 1.6 0 0 1 2.6-1.9L8 14.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d={PATHS[name]} />
    </svg>
  );
}
