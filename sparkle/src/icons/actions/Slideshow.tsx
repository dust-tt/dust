import type { SVGProps } from "react";
import * as React from "react";
const SvgSlideshow = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M13 18v2h4v2H7v-2h4v-2H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h18a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-8ZM4 5v11h16V5H4Zm6 2.5 5 3-5 3v-6Z"
    />
  </svg>
);
export default SvgSlideshow;
