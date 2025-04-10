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
      d="M18 8v2h2v12H4V10h2V8a6 6 0 1 1 12 0Zm-6-4a4 4 0 0 0-4 4v2h8V8a4 4 0 0 0-4-4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLock;
