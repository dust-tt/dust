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
      fillRule="evenodd"
      d="M20 5h-4V3a1 1 0 0 0-1-1H9a1 1 0 0 0-1 1v2H4v2h16V5ZM10 5V4h4v1h-4Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M19 8H5v11a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8Z" />
  </svg>
);
export default SvgTrash;
