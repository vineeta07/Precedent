import type { SVGProps } from 'react';

/** One hand-drawn icon set (1.6px stroke, 20px grid) so nothing looks like a stock icon font. */
const base = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});
type P = SVGProps<SVGSVGElement>;

export const Icon = {
  home: (p: P) => (
    <svg {...base(p)}>
      <path d="M3.5 9 10 3.5 16.5 9v7a.5.5 0 0 1-.5.5h-3.5v-5h-5v5H4a.5.5 0 0 1-.5-.5z" />
    </svg>
  ),
  overview: (p: P) => (
    <svg {...base(p)}>
      <path d="M3.5 16.5v-6M8 16.5v-11M12.5 16.5v-8M17 16.5V3.5" />
    </svg>
  ),
  decision: (p: P) => (
    <svg {...base(p)}>
      <path d="M5 3.5h7v13l-3.5-2.8L5 16.5z" />
      <path d="M12 6.5h3.5v8" opacity=".55" />
    </svg>
  ),
  promise: (p: P) => (
    <svg {...base(p)}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="m7.2 10.2 2 2 3.8-4.2" />
    </svg>
  ),
  incident: (p: P) => (
    <svg {...base(p)}>
      <path d="M15.5 10a5.5 5.5 0 1 1-2-4.2" />
      <path d="M13.8 2.8v3.4h-3.4" />
      <path d="M10 7.5v3l1.8 1.2" />
    </svg>
  ),
  guard: (p: P) => (
    <svg {...base(p)}>
      <path d="M10 3 4.5 5v4.6c0 3.3 2.2 5.7 5.5 7.4 3.3-1.7 5.5-4.1 5.5-7.400V5z" />
      <path d="M10 7.200v3.300M10 13v.1" />
    </svg>
  ),
  guide: (p: P) => (
    <svg {...base(p)}>
      <path d="M10 5.500C8.5 4.3 6.5 4 4 4v11c2.5 0 4.5.3 6 1.5 1.5-1.2 3.5-1.5 6-1.500V4c-2.5 0-4.5.3-6 1.500zM10 5.500v11" />
    </svg>
  ),
  settings: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 6h6M14 6h2M4 14h2M10 14h6" />
      <circle cx="12" cy="6" r="2" />
      <circle cx="8" cy="14" r="2" />
    </svg>
  ),
  search: (p: P) => (
    <svg {...base(p)}>
      <circle cx="9" cy="9" r="5" />
      <path d="m13 13 3.5 3.5" />
    </svg>
  ),
  close: (p: P) => (
    <svg {...base(p)}>
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  ),
  arrow: (p: P) => (
    <svg {...base(p)}>
      <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
    </svg>
  ),
  down: (p: P) => (
    <svg {...base(p)}>
      <path d="M10 4v12M5.5 11.5 10 16l4.5-4.5" />
    </svg>
  ),
  external: (p: P) => (
    <svg {...base(p)}>
      <path d="M8 5H5v10h10v-3M11 4.500h4.500V9M15.5 4.5 9.5 10.5" />
    </svg>
  ),
  check: (p: P) => (
    <svg {...base(p)}>
      <path d="m4.5 10.5 3.5 3.5 7.5-8" />
    </svg>
  ),
  alert: (p: P) => (
    <svg {...base(p)}>
      <path d="M10 3.5 17 16H3z" />
      <path d="M10 8.500v3.500M10 14v.1" />
    </svg>
  ),
  info: (p: P) => (
    <svg {...base(p)}>
      <circle cx="10" cy="10" r="6.5" />
      <path d="M10 9.500V13M10 7v.1" />
    </svg>
  ),
  sun: (p: P) => (
    <svg {...base(p)}>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 3v1.500M10 15.500V17M3 10h1.500M15.5 10H17M5 5l1 1M14 14l1 1M15 5l-1 1M6 14l-1 1" />
    </svg>
  ),
  moon: (p: P) => (
    <svg {...base(p)}>
      <path d="M15.5 11.500A6 6 0 0 1 8.5 4.500a6 6 0 1 0 7 7z" />
    </svg>
  ),
  collapse: (p: P) => (
    <svg {...base(p)}>
      <rect x="3.5" y="4" width="13" height="12" rx="2" />
      <path d="M8 4v12" />
    </svg>
  ),
  spark: (p: P) => (
    <svg {...base(p)}>
      <path d="M10 3.5 11.4 8.6 16.5 10l-5.1 1.400L10 16.500l-1.4-5.100L3.5 10l5.1-1.400z" />
    </svg>
  ),
  link: (p: P) => (
    <svg {...base(p)}>
      <path d="M8.5 11.500a3 3 0 0 0 4.2 0l2.3-2.300a3 3 0 0 0-4.2-4.200l-.8.8" />
      <path d="M11.5 8.500a3 3 0 0 0-4.2 0L5 10.800A3 3 0 0 0 9.2 15l.8-.8" />
    </svg>
  ),
  refresh: (p: P) => (
    <svg {...base(p)}>
      <path d="M15.5 10a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M14.5 3v3.500H11" />
    </svg>
  ),
  page: (p: P) => (
    <svg {...base(p)}>
      <path d="M5.5 3.500h6l3 3v10h-9z" />
      <path d="M11.5 3.500v3h3M8 10h4M8 13h4" />
    </svg>
  ),
  lock: (p: P) => (
    <svg {...base(p)}>
      <rect x="4.5" y="9" width="11" height="7.5" rx="1.5" />
      <path d="M7 9V6.500a3 3 0 0 1 6 0V9" />
    </svg>
  ),
};
