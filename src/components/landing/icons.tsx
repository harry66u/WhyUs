import type { SVGProps } from "react";

/** Playback icons for the research replay, drawn on the same 16px grid and 1.5px stroke as components/ui/icons. */
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

export const IconPause = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 3.5v9M10.5 3.5v9" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3.25v9.5L12.5 8z" />
  </Svg>
);

export const IconReplay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.25 8a4.75 4.75 0 1 0 1.4-3.36" />
    <path d="M3 2.75v2.5h2.5" />
  </Svg>
);
