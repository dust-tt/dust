import type { SVGProps } from "react";
import * as React from "react";
const SvgSidebarLeftClose = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m11 12 3-3v6l-3-3Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M5 21a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5Zm14-2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H9v14h10Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSidebarLeftClose;
