import type { SVGProps } from "react";
import * as React from "react";

const SvgSy = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0C5.7 0 2.033 2.714.62 6.522h18.756A10 10 0 0 0 10 0"
    />
    <path
      fill="#000"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621A10 10 0 0 0 10 20"
    />
    <path
      fill="#6DA544"
      d="m5.975 7.609.54 1.66H8.26l-1.413 1.027.54 1.66-1.413-1.026-1.412 1.027.54-1.661-1.414-1.027h1.747zM14.024 7.609l.54 1.66h1.746l-1.413 1.027.54 1.66-1.413-1.026-1.413 1.027.54-1.661-1.413-1.027h1.747z"
    />
  </svg>
);
export default SvgSy;
