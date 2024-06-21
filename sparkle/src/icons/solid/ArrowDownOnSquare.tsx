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
      d="M17.5 18a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5v-5H4v5a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5h-2.5v5Z"
    />
  </svg>
);
export default SvgArrowDownOnSquare;
