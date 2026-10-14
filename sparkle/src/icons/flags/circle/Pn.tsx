import type { SVGProps } from "react";
import * as React from "react";

const SvgPn = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#ACABB1"
      d="m15.653 6.087-1.305.435-1.304-.435L12.61 5l.435-1.087h2.609L15.218 5z"
    />
    <path
      fill="#338AF3"
      d="M11.305 6.087v4.783c0 2.33 3.043 3.043 3.043 3.043s3.044-.714 3.044-3.043V6.087z"
    />
    <path
      fill="#6DA544"
      d="M11.578 12.003c.748 1.436 2.77 1.91 2.77 1.91s2.02-.474 2.768-1.91L14.347 7.39z"
    />
    <path
      fill="#FFDA44"
      d="m17.392 10.821-3.044-4.734-3.043 4.734v.049c0 .43.104.806.274 1.133l2.77-4.308 2.768 4.308c.17-.327.275-.702.275-1.133z"
    />
  </svg>
);
export default SvgPn;
