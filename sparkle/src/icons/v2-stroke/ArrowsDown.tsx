import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowsDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.965 4a1.035 1.035 0 0 1 2.07 0v13.502l2.234-2.233a1.034 1.034 0 1 1 1.463 1.462l-4 4a1.034 1.034 0 0 1-1.463 0l-4-4A1.034 1.034 0 1 1 3.73 15.27l2.234 2.233zm10 0a1.035 1.035 0 0 1 2.07 0v8.502l2.234-2.233a1.034 1.034 0 1 1 1.463 1.462l-4 4a1.034 1.034 0 0 1-1.463 0l-4-4a1.034 1.034 0 1 1 1.463-1.462l2.233 2.233z"
    />
  </svg>
);
export default SvgArrowsDown;
