import type { SVGProps } from "react";
import * as React from "react";
const SvgServer = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M15 17h2v2h-2v-2Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M21 19a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v14ZM19 5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v9.17c.313-.11.65-.17 1-.17h12c.35 0 .687.06 1 .17V5ZM5 17v2a1 1 0 0 0 1 1h12a.996.996 0 0 0 1-1v-2a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgServer;
