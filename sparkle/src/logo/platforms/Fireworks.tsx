import type { SVGProps } from "react";
import * as React from "react";
const SvgFireworks = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Fireworks_svg__a)">
      <path
        fill="#4A1DBD"
        d="M0 4a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4Z"
      />
      <g fill="#fff" clipPath="url(#Fireworks_svg__b)">
        <path d="M11.986 13.04a1.366 1.366 0 0 1-1.265-.85L8.161 6H9.66l2.335 5.662L14.328 6h1.498l-2.575 6.192c-.213.514-.71.848-1.265.848ZM15.326 15.998a1.368 1.368 0 0 1-1.263-.843 1.387 1.387 0 0 1 .286-1.507l4.662-4.782.582 1.39-4.268 4.37 6.084-.033.582 1.39-6.663.017-.003-.002h.001ZM2 15.981l.582-1.39 6.084.034-4.267-4.371.582-1.391 4.662 4.782c.39.399.502.99.286 1.506a1.368 1.368 0 0 1-1.263.844l-6.664-.016-.002.002Z" />
      </g>
    </g>
    <defs>
      <clipPath id="Fireworks_svg__a">
        <rect width={24} height={24} fill="#fff" rx={4} />
      </clipPath>
      <clipPath id="Fireworks_svg__b">
        <path fill="#fff" d="M2 6h20v10H2z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgFireworks;
