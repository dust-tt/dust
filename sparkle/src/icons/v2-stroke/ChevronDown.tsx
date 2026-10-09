import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.269 8.269a1.034 1.034 0 1 1 1.463 1.462l-6 6a1.034 1.034 0 0 1-1.463 0l-6-6A1.034 1.034 0 1 1 6.73 8.27L12 13.537z"
    />
  </svg>
);
export default SvgChevronDown;
