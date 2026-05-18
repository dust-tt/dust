import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowUp = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 20V6.498L6.73 10.731A1.034 1.034 0 1 1 5.27 9.27l6-6 .078-.072a1.035 1.035 0 0 1 1.385.072l6 6a1.034 1.034 0 1 1-1.463 1.462l-4.234-4.233V20a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowNarrowUp;
