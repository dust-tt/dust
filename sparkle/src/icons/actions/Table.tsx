import type { SVGProps } from "react";
import * as React from "react";
const SvgTable = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4 8h16V5H4v3Zm10 11v-9h-4v9h4Zm2 0h4v-9h-4v9Zm-8 0v-9H4v9h4ZM3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
    />
  </svg>
);
export default SvgTable;
