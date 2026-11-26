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

export const IconNav = (p: IP) => (
  <Svg {...p} sw={1.6}>
    <path d="M3.6 11.2L20.4 3.6l-7.6 16.8-2.2-7.2z" fill="currentColor" />
  </Svg>
);
export const IconSliders = (p: IP) => (
  <Svg {...p}>
    <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
    <circle cx="15" cy="7" r="2.4" />
    <circle cx="9" cy="17" r="2.4" />
  </Svg>
);
export const IconWarn = (p: IP) => (
  <Svg {...p}>
    <path d="M12 4.2l9 15.6H3z" />
    <path d="M12 10v4.4M12 17.2v.2" />
  </Svg>
);
export const IconDumbbell = (p: IP) => (
  <Svg {...p}>
    <path d="M6.5 7.5v9M17.5 7.5v9M3.5 10v4M20.5 10v4M6.5 12h11" />
  </Svg>
);
export const IconHeart = (p: IP) => (
  <Svg {...p}>
    <path d="M12 19.6s-7.2-4.4-7.2-9.9a4.1 4.1 0 0 1 7.2-2.6 4.1 4.1 0 0 1 7.2 2.6c0 5.5-7.2 9.9-7.2 9.9z" />
  </Svg>
);
export const IconPlane = (p: IP) => (
  <Svg {...p} sw={1.8}>
    <path d="M21 15.2l-8.2-4.7V5.6a1.6 1.6 0 0 0-3.2 0v4.9L1.4 15.2v1.6l8.2-2.1v3.5l-2.2 1.6v1.4l4.4-1.1 4.4 1.1v-1.4l-2.2-1.6v-3.5l8.2 2.1z" transform="translate(0 -2.2) rotate(0)" />
  </Svg>
);
export const IconRocket = (p: IP) => (
  <Svg {...p} sw={1.8}>
    <path d="M14.2 4.2c2.7-.6 5 -.4 5.6-.2.2.6.4 2.9-.2 5.6-.8 3.5-3.6 6-6.8 7.2l-4.3-4.3c1.2-3.200 3.700-6 7.700-8.300z" transform="translate(-0.4 0.4)" />
    <circle cx="15" cy="9" r="1.4" />
    <path d="M7.8 13.6c-2 .2-3.200 1.600-3.600 4.200 2.600-.4 4-1.600 4.200-3.600M6.300 17.700l-1.100 1.100" />
  </Svg>
);
export const IconUsers = (p: IP) => (
  <Svg {...p} sw={1.8}>
    <circle cx="9" cy="8.2" r="3.1" />
    <path d="M3 19c0-3.300 2.600-5.400 6-5.400s6 2.100 6 5.400" />
    <circle cx="17.2" cy="9.2" r="2.4" />
    <path d="M16.600 13.800c2.500.2 4.400 2 4.400 4.700" />
  </Svg>
);
export const IconChart = (p: IP) => (
  <Svg {...p} sw={2.2}>
    <path d="M5 19v-5M11 19v-8M17 19v-11" />
    <path d="M14.500 5.200h3.600v3.600" strokeWidth="1.800" />
  </Svg>
);
export const IconWallet = (p: IP) => (
  <Svg {...p}>
    <path d="M4 8.500A2.500 2.500 0 0 1 6.500 6H18v13H6.500A2.500 2.500 0 0 1 4 16.500z" />
    <path d="M18 10.500h-3a1.500 1.500 0 0 0 0 3h3" />
  </Svg>
);
export const IconStar = (p: IP) => (
  <Svg {...p}>
    <path d="M12 4.400l2.400 5 5.500.7-4 3.800 1 5.400-4.900-2.700-4.900 2.700 1-5.400-4-3.800 5.500-.7z" />
  </Svg>
);
export const IconHome = (p: IP) => (
  <Svg {...p}>
    <path d="M4 11l8-6.500L20 11v8.500h-5.500V14h-5v5.500H4z" />
  </Svg>
);
export const IconPin = (p: IP) => (
  <Svg {...p}>
    <path d="M12 20.500s6-5.500 6-10.200a6 6 0 0 0-12 0c0 4.700 6 10.200 6 10.200z" />
    <circle cx="12" cy="10.200" r="2.200" />
  </Svg>
);

import type { DestIcon } from '../lib/types';
export function destIcon(k: DestIcon | undefined, size = 16) {
  switch (k) {
    case 'dumbbell':
      return <IconDumbbell size={size} />;
    case 'heart':
      return <IconHeart size={size} />;
    case 'plane':
      return <IconPlane size={size} />;
    case 'rocket':
      return <IconRocket size={size} />;
    case 'users':
      return <IconUsers size={size} />;
    case 'wallet':
      return <IconWallet size={size} />;
    case 'star':
      return <IconStar size={size} />;
    case 'home':
      return <IconHome size={size} />;
    case 'flag':
      return <IconFlag size={size} />;
    default:
      return <IconFocus size={size} />;
  }
}
export const DEST_ICONS: DestIcon[] = ['target', 'dumbbell', 'heart', 'plane', 'rocket', 'users', 'wallet', 'star', 'home', 'flag'];
