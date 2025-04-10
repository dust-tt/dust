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
      fill="#111418"
      fillRule="evenodd"
      d="M18 10V8A6 6 0 0 0 6 8v2H4v12h16V10h-2ZM8 8a4 4 0 1 1 8 0v2H8V8Zm10 12v-8H6v8h12Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLock;
