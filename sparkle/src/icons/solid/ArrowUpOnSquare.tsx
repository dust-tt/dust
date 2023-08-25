import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowUpOnSquare = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m6 8 6-6 6 6h-4.5v7h-3V8H6Z" />
    <path
      fill="currentColor"
      d="M20 19H4v-7H2v8a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-8h-2v7Z"
    />
  </svg>
);
export default SvgArrowUpOnSquare;
