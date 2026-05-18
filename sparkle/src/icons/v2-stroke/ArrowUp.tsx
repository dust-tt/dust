import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 19V7.498L5.73 12.731a1.034 1.034 0 1 1-1.462-1.463l7-7 .078-.07a1.035 1.035 0 0 1 1.385.07l7 7a1.034 1.034 0 1 1-1.463 1.463l-5.234-5.233V19a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowUp;
