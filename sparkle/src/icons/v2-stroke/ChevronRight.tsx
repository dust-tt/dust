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
      d="M8.269 5.269a1.034 1.034 0 0 1 1.462 0l6 6a1.034 1.034 0 0 1 0 1.463l-6 6a1.034 1.034 0 1 1-1.462-1.463L13.537 12 8.27 6.731a1.034 1.034 0 0 1 0-1.462"
    />
  </svg>
);
export default SvgChevronRight;
