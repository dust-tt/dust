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
      d="M5.965 20V6.498L3.73 8.731A1.034 1.034 0 1 1 2.27 7.27l4-4 .078-.072a1.035 1.035 0 0 1 1.384.072l4 4A1.034 1.034 0 1 1 10.27 8.73L8.035 6.498V20a1.035 1.035 0 0 1-2.07 0m10 0v-8.502l-2.233 2.233a1.034 1.034 0 1 1-1.463-1.463l4-4 .078-.07a1.035 1.035 0 0 1 1.384.07l4 4a1.034 1.034 0 1 1-1.462 1.463l-2.234-2.233V20a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowsUp;
