import type { SVGProps } from "react";
import * as React from "react";
const SvgSidebarRightClose = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m13 12-3 3V9l3 3Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M19 3a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3h14ZM5 5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10V5H5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSidebarRightClose;
