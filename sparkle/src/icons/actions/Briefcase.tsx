import type { SVGProps } from "react";
import * as React from "react";
const SvgBriefcase = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M7 5V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4Zm8 2H9v12h6V7ZM7 7H4v12h3V7Zm10 0v12h3V7h-3ZM9 3v2h6V3H9Z"
    />
  </svg>
);
export default SvgBriefcase;
