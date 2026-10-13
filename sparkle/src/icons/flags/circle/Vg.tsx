import type { SVGProps } from "react";
import * as React from "react";

const SvgVg = (props: SVGProps<SVGSVGElement>) => (
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
    <path
      fill="#FFDA44"
      d="m14.347 10-2.702 2.703a3.043 3.043 0 0 0 5.405 0z"
    />
    <path fill="#D80027" d="M10 8.77 6.445 5.217h-1.23L10 10z" />
    <path
      fill="#6DA544"
      d="M11.305 5.217V10c0 2.33 3.043 3.044 3.043 3.044s3.044-.714 3.044-3.044V5.217z"
    />
    <path fill="#F0F0F0" d="M13.695 7.391H15v3.479h-1.305z" />
    <path
      fill="#A2001D"
      d="M14.348 8.043a.652.652 0 1 0 0-1.304.652.652 0 0 0 0 1.304"
    />
    <path
      fill="#FFDA44"
      d="M12.174 6.087h.87v.87h-.87zM12.174 8.043h.87v.87h-.87zM12.174 10h.87v.87h-.87zM15.652 6.087h.87v.87h-.87zM15.652 8.043h.87v.87h-.87zM15.652 10h.87v.87h-.87z"
    />
  </svg>
);
export default SvgVg;
