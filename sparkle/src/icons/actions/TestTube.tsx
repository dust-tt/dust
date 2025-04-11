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
      d="M17 2v2h-1v14a4 4 0 0 1-8 0V4H7V2h10Zm-3 8h-4v8a2 2 0 1 0 4 0v-8Zm-1 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm-2-3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Zm3-8h-4v4h4V4Z"
    />
  </svg>
);
export default SvgTestTube;
