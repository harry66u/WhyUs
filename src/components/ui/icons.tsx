import type { SVGProps } from "react";

/**
 * A small, consistent icon set (1.5px strokes on a 16px grid). Kept in-house so
 * the product never picks up generic "AI" iconography.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Svg>
);
export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Svg>
);
export const IconBlocked = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M4.2 11.8l7.6-7.6" />
  </Svg>
);
export const IconPage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 1.75h5.25L12 4.5v9.75H4z" />
    <path d="M9 1.75V4.75h3M6 8h4M6 10.5h4" />
  </Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 2.5h4v4M13.5 2.5L7.5 8.5M11.5 9.5v3.25a.75.75 0 01-.75.75h-7.5a.75.75 0 01-.75-.75v-7.5a.75.75 0 01.75-.75H6.5" />
  </Svg>
);
export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2v8.5M5 5l3-3 3 3M3 9.5v3.75c0 .4.34.75.75.75h8.5c.41 0 .75-.35.75-.75V9.5" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2v8.5M5 7.5l3 3 3-3M3 13.5h10" />
  </Svg>
);
export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
);
export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5L10.5 8 6 12.5" />
  </Svg>
);
export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6L8 10.5 12.5 6" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Svg>
);
export const IconSwap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13" />
  </Svg>
);
export const IconMatch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="4.5" cy="8" r="2.5" />
    <circle cx="11.5" cy="8" r="2.5" />
    <path d="M7 8h2" />
  </Svg>
);
export const IconQuote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9.5c0-2.5 1-4 3-4.75M3 9.5h2.75v3H3zM9.5 9.5c0-2.5 1-4 3-4.75M9.5 9.5h2.75v3H9.5z" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="5.5" r="2.75" />
    <path d="M2.75 14c.6-2.6 2.75-4 5.25-4s4.65 1.4 5.25 4" />
  </Svg>
);
export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="5.5" r="2.25" />
    <path d="M1.75 13.5c.5-2.2 2.1-3.5 4.25-3.5s3.75 1.3 4.25 3.5M10.5 3.5a2.25 2.25 0 010 4.25M12 10.25c1.1.45 1.9 1.6 2.25 3.25" />
  </Svg>
);
export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.25" y="2.25" width="4.5" height="4.5" rx="1" />
    <rect x="9.25" y="2.25" width="4.5" height="4.5" rx="1" />
    <rect x="2.25" y="9.25" width="4.5" height="4.5" rx="1" />
    <rect x="9.25" y="9.25" width="4.5" height="4.5" rx="1" />
  </Svg>
);
export const IconDraft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 13.5h3l7-7-3-3-7 7z" />
    <path d="M8.5 5l3 3" />
  </Svg>
);
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.75v1.5M8 12.75v1.5M14.25 8h-1.5M3.25 8h-1.5M12.4 3.6l-1.06 1.06M4.66 11.34L3.6 12.4M12.4 12.4l-1.06-1.06M4.66 4.66L3.6 3.6" />
  </Svg>
);
export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1.5v1.25M8 13.25v1.25M14.5 8h-1.25M2.75 8H1.5M12.6 3.4l-.9.9M4.3 11.7l-.9.9M12.6 12.6l-.9-.9M4.3 4.3l-.9-.9" />
  </Svg>
);
export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 9.75A5.5 5.5 0 016.25 3a5.5 5.5 0 106.75 6.75z" />
  </Svg>
);
export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="10" height="7" rx="1.25" />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
  </Svg>
);
export const IconTrash = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 9h6.8l.6-9" />
  </Svg>
);
export const IconUpload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 10.5V2M5 5l3-3 3 3M3 9.5v3.75c0 .4.34.75.75.75h8.5c.41 0 .75-.35.75-.75V9.5" />
  </Svg>
);
export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 8H3M7 4L3 8l4 4" />
  </Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="5.75" />
    <path d="M8 4.75V8l2.25 1.5" />
  </Svg>
);
