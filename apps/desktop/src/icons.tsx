/** 线性图标集(Lucide 风格,stroke=currentColor)。全站不用 emoji。 */
import type { ReactNode } from 'react';

function Svg({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
type P = { size?: number };

export const IconGrid = (p: P) => (
  <Svg size={p.size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M12 3v18" />
  </Svg>
);
export const IconSelect = (p: P) => (
  <Svg size={p.size}>
    <path d="M5 3a2 2 0 0 0-2 2M19 3a2 2 0 0 1 2 2M21 19a2 2 0 0 1-2 2M5 21a2 2 0 0 1-2-2M9 3h1M14 3h1M9 21h1M14 21h1M3 9v1M21 9v1M3 14v1M21 14v1" />
  </Svg>
);
export const IconArrow = (p: P) => (
  <Svg size={p.size}>
    <path d="M5 12h14M12 5l7 7-7 7" />
  </Svg>
);
export const IconStrike = (p: P) => (
  <Svg size={p.size}>
    <path d="M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16" />
  </Svg>
);
export const IconPencil = (p: P) => (
  <Svg size={p.size}>
    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Svg>
);
export const IconHelp = (p: P) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
    <path d="M12 17h.01" />
  </Svg>
);
export const IconFilter = (p: P) => (
  <Svg size={p.size}>
    <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
  </Svg>
);
export const IconFlag = (p: P) => (
  <Svg size={p.size}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <path d="M4 22v-7" />
  </Svg>
);
export const IconSigma = (p: P) => (
  <Svg size={p.size}>
    <path d="M18 7V4H6l6 8-6 8h12v-3" />
  </Svg>
);
export const IconPaperclip = (p: P) => (
  <Svg size={p.size}>
    <path d="M21.4 11 12.2 20.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.9-2.8l8.5-8.5" />
  </Svg>
);
export const IconImage = (p: P) => (
  <Svg size={p.size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" />
  </Svg>
);
export const IconClock = (p: P) => (
  <Svg size={p.size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
export const IconSend = (p: P) => (
  <Svg size={p.size}>
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
    <path d="M22 2 11 13" />
  </Svg>
);
export const IconChevron = (p: P) => (
  <Svg size={p.size}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
export const IconSearch = (p: P) => (
  <Svg size={p.size}>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);
export const IconDots = (p: P) => (
  <Svg size={p.size}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
);
export const IconUndo = (p: P) => (
  <Svg size={p.size}>
    <path d="M3 7v6h6" />
    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
  </Svg>
);
export const IconCheck = (p: P) => (
  <Svg size={p.size}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
export const IconX = (p: P) => (
  <Svg size={p.size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const IconDoc = (p: P) => (
  <Svg size={p.size}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
  </Svg>
);
export const IconPlus = (p: P) => (
  <Svg size={p.size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);
