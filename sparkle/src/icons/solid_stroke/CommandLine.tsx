import type { SVGProps } from "react";
import * as React from "react";
const SvgCommandLine = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M2.25 6a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V6Zm3-1.5A1.5 1.5 0 0 0 3.75 6v12a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H5.25Zm.9 2.55A.75.75 0 0 1 7.2 6.9l3 2.25a.75.75 0 0 1 0 1.2l-3 2.25a.75.75 0 1 1-.9-1.2l2.2-1.65L6.3 8.1a.75.75 0 0 1-.15-1.05ZM10.5 12a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCommandLine;
