"use client";

// A QR code a phone's camera opens, drawn as an SVG: dark squares on a light
// ground whatever the theme, since a camera reads contrast and a dark-mode
// code (light on dark) is one many cannot. The squares are one path, so a
// code of a few hundred modules is one element, not a few hundred.

import { useMemo } from "react";
import { encode } from "uqr";

export default function QrCode({
  text,
  label,
  className = "qr",
}: {
  text: string;
  /** what it opens, for a screen reader */
  label: string;
  className?: string;
}) {
  const { d, size } = useMemo(() => {
    // medium error correction: still read through a scuff or a glare
    const { data, size } = encode(text, { ecc: "M", border: 0 });
    let path = "";
    data.forEach((row, y) =>
      row.forEach((on, x) => {
        if (on) path += `M${x} ${y}h1v1h-1z`;
      })
    );
    return { d: path, size };
  }, [text]);
  // the quiet zone round the code that a reader needs to find its edges
  const pad = 3;
  return (
    <svg
      className={className}
      viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2} fill="#fff" rx={2} />
      <path d={d} fill="#111" />
    </svg>
  );
}
