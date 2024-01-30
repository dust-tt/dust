import type { SVGProps } from "react";
import * as React from "react";
const SvgPuzzle = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 4a3 3 0 1 1 5.83 1H19v5.17a3 3 0 1 1 0 5.659V21H3V5h5.17C8.06 4.687 8 4.35 8 4Z"
    />
  </svg>
);
export default SvgPuzzle;
