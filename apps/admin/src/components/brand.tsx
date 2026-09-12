import type { ReactNode } from 'react';

export type IconName =
  | 'grid'
  | 'review'
  | 'pin'
  | 'globe'
  | 'history'
  | 'refresh'
  | 'arrow'
  | 'mail'
  | 'check'
  | 'close'
  | 'logout'
  | 'shield';

const paths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  review: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3h6v4H9zM8 13l2 2 5-5M9 18h6" />
    </>
  ),
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  history: (
    <>
      <path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7a9 9 0 0 0-15-2L3 8m0-6v6h6M4 17a9 9 0 0 0 15 2l2-3m0 6v-6h-6" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  logout: (
    <>
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4M10 12h11m-4-4 4 4-4 4" />
    </>
  ),
  shield: (
    <>
      <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
};

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Brand() {
  return (
    <span className="brand-lockup">
      <svg className="brand-mark" width="36" height="44" viewBox="0 0 36 44" aria-hidden="true">
        <path d="M18 43S1 24 1 17a17 17 0 1 1 34 0c0 7-17 26-17 26Z" fill="currentColor" />
        <g fill="none" stroke="white" strokeWidth="1.3">
          <circle cx="18" cy="17" r="10" />
          <path d="M8 17h20M18 7v20M11 10c9 3 5 10 14 14M25 10c-9 3-5 10-14 14" />
        </g>
      </svg>
      <span className="brand-wordmark">
        Drop In<span>.</span>
      </span>
    </span>
  );
}
