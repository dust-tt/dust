import * as React from "react";
import type { SVGProps } from "react";
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
      d="M17 5h4v2h-1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7H3V5h4V3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2Zm-8 5v9h2v-9H9Zm4 0v9h2v-9h-2ZM9 4v1h6V4H9Z"
    />
  </svg>
);
export default SvgTrash;
