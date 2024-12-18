import type { SVGProps } from "react";
import * as React from "react";
const SvgTestTube = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 2v2h-1v14a4 4 0 0 1-8 0V4H7V2zm-3 8h-4v8a2 2 0 1 0 4 0zm-1 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2m-2-3a1 1 0 1 1 0 2 1 1 0 0 1 0-2m3-8h-4v4h4z"
    />
  </svg>
);
export default SvgTestTube;
