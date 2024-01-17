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
      d="M7 5a4 4 0 1 1 8 0h3a1 1 0 0 1 1 1v3a4 4 0 0 1 0 8v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3Zm4-2a2 2 0 0 0-1.886 2.667A1 1 0 0 1 8.17 7H5v12h12v-3.17a1 1 0 0 1 1.333-.944 2 2 0 1 0 0-3.773A1 1 0 0 1 17 10.171V7h-3.17a1 1 0 0 1-.944-1.333A2 2 0 0 0 11 3Z"
    />
  </svg>
);
export default SvgPuzzle;
