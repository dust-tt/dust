import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronSelectorHorizontal = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8.269 6.269A1.034 1.034 0 1 1 9.73 7.73L5.463 12l4.268 4.269a1.034 1.034 0 1 1-1.462 1.463l-5-5a1.034 1.034 0 0 1 0-1.463zm6 0a1.034 1.034 0 0 1 1.463 0l5 5a1.034 1.034 0 0 1 0 1.463l-5 5a1.034 1.034 0 1 1-1.463-1.463L18.537 12 14.27 7.731a1.034 1.034 0 0 1 0-1.462"
    />
  </svg>
);
export default SvgChevronSelectorHorizontal;
