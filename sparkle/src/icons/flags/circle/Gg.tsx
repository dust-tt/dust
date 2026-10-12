import type { SVGProps } from "react";
import * as React from "react";

const SvgGg = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M19.915 8.696h-8.61V.085a10 10 0 0 0-2.61 0v8.61H.086a10 10 0 0 0 0 2.61h8.61v8.61a10 10 0 0 0 2.61 0v-8.61h8.61a10 10 0 0 0 0-2.61"
    />
    <path
      fill="#FFDA44"
      d="m12.826 10.435.652.435V9.13l-.652.435h-2.392V7.174l.435-.652H9.13l.435.652v2.391H7.174L6.52 9.13v1.74l.653-.435h2.391v2.391l-.435.652h1.74l-.435-.652v-2.391z"
    />
  </svg>
);
export default SvgGg;
