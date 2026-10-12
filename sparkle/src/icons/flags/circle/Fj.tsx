import type { SVGProps } from "react";
import * as React from "react";

const SvgFj = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M20 10c0 5.523-4.477 10-10 10S0 15.523 0 10c0 .002 10-9.999 10-10 5.523 0 10 4.477 10 10"
    />
    <path
      fill="#0052B4"
      d="M10 4.783v3.372L6.52 4.783zM5.218 10h2.938L5.218 6.087 4.783 9.13z"
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
    <path fill="#D80027" d="M10 8.77 6.446 5.217h-1.23L9.999 10z" />
    <path
      fill="#F3F3F3"
      d="M11.305 6.522V10c0 2.33 3.043 3.044 3.043 3.044s3.044-.714 3.044-3.044V6.522l-3.044-.87z"
    />
    <path
      fill="#D80027"
      d="M17.392 6.522V5.217h-6.087v1.305h2.608V9.13h-2.608V10h2.608v2.91c.263.093.435.133.435.133s.172-.04.435-.133V10h2.609v-.87h-2.61V6.522z"
    />
  </svg>
);
export default SvgFj;
