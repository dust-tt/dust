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
      d="M15.364 8.807 13 11.171V3h-2v8.171L8.636 8.807l-1.414 1.415L12 15l4.778-4.778-1.414-1.415Z"
    />
    <path
      fill="currentColor"
      d="M17 19a1 1 0 0 0 1-1v-5h2v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5h2v5a1 1 0 0 0 1 1h10Z"
    />
  </svg>
);
export default SvgArrowDownOnSquare;
