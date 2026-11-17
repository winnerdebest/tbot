import React from "react";

interface AniLogoProps {
  size?: number;
  className?: string;
}

/**
 * Ani Brand Mark — Bespoke geometric monogram ("A" + signal node).
 * Crisp monochrome vector on a matte dark squircle with a 1px hairline border.
 */
export default function AniLogo({ size = 32, className }: AniLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Matte obsidian squircle base */}
      <rect width="32" height="32" rx="8" fill="#141417" />
      <rect
        x="0.5"
        y="0.5"
        width="31"
        height="31"
        rx="7.5"
        stroke="rgba(255, 255, 255, 0.14)"
      />
      {/* Architectural 'A' + message tail geometry */}
      <path
        d="M16 7.5L8.75 23.5H12.1L13.65 19.8H18.35L19.9 23.5H23.25L16 7.5ZM14.8 17L16 14.05L17.2 17H14.8Z"
        fill="#F4F4F6"
      />
      {/* Signal dot */}
      <circle cx="23.5" cy="9.5" r="2.2" fill="#34D399" />
    </svg>
  );
}
