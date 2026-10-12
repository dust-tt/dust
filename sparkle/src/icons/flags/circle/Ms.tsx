import type { SVGProps } from "react";
import * as React from "react";

const SvgMs = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#0052B4"
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10c0 .002 10-9.999 10-10 5.523 0 10 4.477 10 10"
    />
    <path fill="#F0F0F0" d="M9.973 10h.026v-.027z" />
    <path
      fill="#F0F0F0"
      d="M10 5.217V0h-.002C4.476 0 0 4.478 0 10h5.217V7.062L8.155 10h1.818L10 9.973V8.155L7.062 5.217z"
    />
    <path
      fill="#D80027"
      d="M5.06 1.304A10.05 10.05 0 0 0 1.305 5.06V10h2.608V3.913H10V1.304z"
    />
    <path fill="#D80027" d="M10 8.77 6.445 5.217h-1.23L10 10z" />
    <path
      fill="#338AF3"
      d="M11.305 5.217V10c0 2.33 3.043 3.044 3.043 3.044s3.044-.714 3.044-3.044V5.217z"
    />
    <path
      fill="#A2001D"
      d="M11.305 10c0 2.33 3.043 3.044 3.043 3.044s3.044-.714 3.044-3.044z"
    />
    <path
      fill="#000"
      d="M15.652 7.391h-.87v-.87h-.87v.87h-.869v.87h.87v2.609h.87V8.26h.869z"
    />
  </svg>
);
export default SvgMs;
