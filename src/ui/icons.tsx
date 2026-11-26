import type { ReactNode } from 'react';

function Svg({ children, size = 20, sw = 2 }: { children: ReactNode; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
type IP = { size?: number };

export const IconFocus = (p: IP) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Svg>
);
export const IconSearch = (p: IP) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </Svg>
);
export const IconLocate = (p: IP) => (
  <Svg {...p}>
    <path d="M4 11.2L20 4l-7.2 16-1.8-7z" fill="currentColor" fillOpacity=".18" />
  </Svg>
);
export const IconMore = (p: IP) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.3" fill="currentColor" />
  </Svg>
);
export const IconCheck = (p: IP) => (
  <Svg {...p} sw={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);
export const IconClose = (p: IP) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);
export const IconBack = (p: IP) => (
  <Svg {...p} sw={2.4}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Svg>
);
export const IconChevron = (p: IP) => (
  <Svg {...p} sw={2.2}>
    <path d="M9.5 5.5L16 12l-6.5 6.5" />
  </Svg>
);
export const IconPlus = (p: IP) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
export const IconMinus = (p: IP) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);
export const IconTurn = (p: IP) => (
  <Svg {...p} sw={2.4}>
    <path d="M7 20v-7a4 4 0 0 1 4-4h6" />
    <path d="M13.5 5.5L18 9l-4.5 3.5" />
  </Svg>
);
export const IconPlay = (p: IP) => (
  <Svg {...p}>
    <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
  </Svg>
);
export const IconPause = (p: IP) => (
  <Svg {...p}>
    <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth="3.2" />
  </Svg>
);
export const IconBlock = (p: IP) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M6 6l12 12" />
  </Svg>
);
export const IconResult = (p: IP) => (
  <Svg {...p}>
    <path d="M5 19V9M12 19V5M19 19v-7" />
  </Svg>
);
export const IconRecalc = (p: IP) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 4v4.5h-4.5" />
  </Svg>
);
export const IconEdit = (p: IP) => (
  <Svg {...p}>
    <path d="M4 20l4-1 10.5-10.5a2 2 0 0 0-3-3L5 16z" />
  </Svg>
);
export const IconTrash = (p: IP) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
  </Svg>
);
export const IconUp = (p: IP) => (
  <Svg {...p} sw={2.4}>
    <path d="M6 14l6-6 6 6" />
  </Svg>
);
export const IconDown = (p: IP) => (
  <Svg {...p} sw={2.4}>
    <path d="M6 10l6 6 6-6" />
  </Svg>
);
export const IconDownload = (p: IP) => (
  <Svg {...p}>
    <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14" />
  </Svg>
);
export const IconUpload = (p: IP) => (
  <Svg {...p}>
    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14" />
  </Svg>
);
export const IconBell = (p: IP) => (
  <Svg {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
);
export const IconLock = (p: IP) => (
  <Svg {...p}>
    <rect x="5.5" y="11" width="13" height="9" rx="2.5" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </Svg>
);
export const IconLayers = (p: IP) => (
  <Svg {...p}>
    <path d="M12 4l8.5 4.5L12 13 3.5 8.5z" />
    <path d="M3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
  </Svg>
);
export const IconHistory = (p: IP) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4.5V9h4.5M12 8v4.5l3 1.8" />
  </Svg>
);
export const IconGauge = (p: IP) => (
  <Svg {...p}>
    <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
    <path d="M12 13l4-4" />
  </Svg>
);
export const IconZone = (p: IP) => (
  <Svg {...p}>
    <path d="M12 3.5a8.5 8.5 0 1 1-.01 0" strokeDasharray="3 3.2" />
  </Svg>
);
export const IconGear = (p: IP) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
  </Svg>
);
export const IconFlag = (p: IP) => (
  <Svg {...p}>
    <path d="M6 21V4M6 5c4-2 6 2 12 0v8c-6 2-8-2-12 0" />
  </Svg>
);
export const IconClock = (p: IP) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);
export const IconCoffee = (p: IP) => (
  <Svg {...p}>
    <path d="M5 9h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" />
    <path d="M16 10.5h1.5a2 2 0 0 1 0 4H16M8 4v2M12 4v2" />
  </Svg>
);
export const IconShare = (p: IP) => (
  <Svg {...p}>
    <path d="M12 15V4M8 8l4-4 4 4" />
    <path d="M6 12v7h12v-7" />
  </Svg>
);
