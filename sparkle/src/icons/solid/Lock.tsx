import type { SVGProps } from "react";
import * as React from "react";
const SvgLock = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 8a4 4 0 1 1 8 0h2A6 6 0 0 0 6 8v2H4v12h16V10H8V8Z"
    />
  </svg>
);
export default SvgLock;
