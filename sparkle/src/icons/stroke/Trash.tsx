import type { SVGProps } from "react";
import * as React from "react";
const SvgTrash = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16 5h4v2h-1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7H4V5h4V3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2Zm1 2H7v13h10V7Zm-7-3v1h4V4h-4Z"
    />
  </svg>
);
export default SvgTrash;
