import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronRightDouble = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.269 6.269a1.034 1.034 0 0 1 1.462 0l5 5a1.034 1.034 0 0 1 0 1.463l-5 5a1.034 1.034 0 1 1-1.462-1.463L9.537 12 5.27 7.731a1.034 1.034 0 0 1 0-1.462m7 0a1.034 1.034 0 0 1 1.463 0l5 5a1.034 1.034 0 0 1 0 1.463l-5 5a1.034 1.034 0 1 1-1.463-1.463L16.537 12 12.27 7.731a1.034 1.034 0 0 1 0-1.462"
    />
  </svg>
);
export default SvgChevronRightDouble;
