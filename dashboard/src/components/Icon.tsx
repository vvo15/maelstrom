import type { ReactNode } from "react";

export type IconName =
  | "check"
  | "circle"
  | "flag"
  | "shield"
  | "alert"
  | "block"
  | "arrow"
  | "maze"
  | "decoy"
  | "info"
  | "play"
  | "pause"
  | "restart"
  | "external"
  | "search";

const SHAPES: Record<IconName, ReactNode> = {
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l3 3 5-6" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="9" />,
  flag: (
    <>
      <path d="M6 21V4" />
      <path d="M6 4h11l-2 4 2 4H6" />
    </>
  ),
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5" />
      <path d="M12 18v.01" />
    </>
  ),
  block: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  maze: (
    <>
      <rect x="4" y="4" width="16" height="16" />
      <path d="M4 9h10M10 14h10M4 19h6M14 9v5" />
    </>
  ),
  decoy: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7.5v.01" />
    </>
  ),
  play: <path d="M7 5l12 7-12 7z" />,
  pause: <path d="M8 5v14M16 5v14" />,
  restart: (
    <>
      <path d="M4 12a8 8 0 1 0 3-6.2" />
      <path d="M4 4v5h5" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5H5V6h5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l5 5" />
    </>
  ),
};

/** Decorative icon. Always pair it with visible text. */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      width="1.1em"
      height="1.1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
