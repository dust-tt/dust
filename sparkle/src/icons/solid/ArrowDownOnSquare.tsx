import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowDownOnSquare = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="m15.5 7.5-2 2V3h-3v6.5l-2-2-2 2L12 15l5.5-5.5-2-2Z"
    />
    <path
      fill="currentColor"
      d="M17 19a1 1 0 0 0 1-1v-5h2v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5h2v5a1 1 0 0 0 1 1h10Z"
    />
  </svg>
);
export default SvgArrowDownOnSquare;
