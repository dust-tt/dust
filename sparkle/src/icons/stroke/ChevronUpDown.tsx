import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronUpDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="m9 11 3-3 3 3 1.5-1.5L12 5 7.5 9.5 9 11ZM15 13l-3 3-3-3-1.5 1.5L12 19l4.5-4.5L15 13Z"
    />
  </svg>
);
export default SvgChevronUpDown;
