import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8.269 5.268a1.034 1.034 0 0 1 1.463 0l6 6a1.034 1.034 0 0 1 0 1.463l-6 6a1.034 1.034 0 1 1-1.463-1.463L13.537 12 8.27 6.73a1.034 1.034 0 0 1 0-1.463"
    />
  </svg>
);
export default SvgChevronRight;
