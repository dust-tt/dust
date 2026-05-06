import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowsUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15.965 20v-8.502l-2.233 2.233a1.034 1.034 0 1 1-1.463-1.463l4-4 .078-.07a1.035 1.035 0 0 1 1.385.07l4 4a1.034 1.034 0 1 1-1.463 1.463l-2.233-2.233V20a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M5.965 20V6.498L3.732 8.731A1.034 1.034 0 1 1 2.269 7.27l4-4 .078-.072a1.035 1.035 0 0 1 1.385.072l4 4a1.034 1.034 0 1 1-1.463 1.462L8.036 6.498V20a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowsUp;
