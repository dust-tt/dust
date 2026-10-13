import type { SVGProps } from "react";
import * as React from "react";

const SvgGi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F9F9F9"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M10 20c4.299 0 7.964-2.714 9.377-6.522H.621C2.034 17.286 5.7 20 10 20M13.913 8.26V6.958h.434v-.87h-.87v.435h-.869v-.435h-.87v.87h.435V8.26h-.87V5.217h.436v-.87h-.87v.436h-.435v-.435h-.87v.435H9.13v-.435h-.87v.87h.435V8.26h-.87V6.957h.435v-.87h-.87v.435h-.869v-.435h-.87v.87h.435V8.26h-.87v3.478h9.566V8.261z"
    />
    <path
      fill="#FFDA44"
      d="M10 11.304a1.304 1.304 0 0 0-.434 2.534v1.814H8.262v1.74h2.174v-3.553A1.305 1.305 0 0 0 10 11.304m0 1.74a.435.435 0 1 1 0-.87.435.435 0 0 1 0 .87"
    />
  </svg>
);
export default SvgGi;
