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
    <path fill="#111418" d="m13.5 9.5 2-2 2 2L12 15 6.5 9.5l2-2 2 2V3h3v6.5Z" />
    <path
      fill="#111418"
      d="M17 18.5a.5.5 0 0 0 .5-.5v-5H20v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5h2.5v5a.5.5 0 0 0 .5.5h10Z"
    />
  </svg>
);
export default SvgArrowDownOnSquare;
