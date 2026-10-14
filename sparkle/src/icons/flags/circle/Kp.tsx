import type { SVGProps } from "react";
import * as React from "react";

const SvgKp = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#0052B4"
      d="M10 0a9.98 9.98 0 0 0-7.58 3.478h15.16A9.98 9.98 0 0 0 10 0M17.58 16.522H2.42A9.98 9.98 0 0 0 10 20a9.98 9.98 0 0 0 7.58-3.478"
    />
    <path
      fill="#D80027"
      d="M18.532 4.783H1.468A9.95 9.95 0 0 0 0 10c0 1.912.537 3.698 1.468 5.217h17.064A9.95 9.95 0 0 0 20 10a9.95 9.95 0 0 0-1.468-5.217"
    />
    <path
      fill="#F0F0F0"
      d="M6.153 13.848a3.848 3.848 0 1 0 0-7.696 3.848 3.848 0 0 0 0 7.696"
    />
    <path
      fill="#D80027"
      d="m6.152 6.152.863 2.657h2.799l-2.265 1.643.87 2.665-2.267-1.65-2.264 1.646.867-2.661-2.263-1.643h2.796z"
    />
  </svg>
);
export default SvgKp;
