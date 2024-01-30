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
      d="M7 5a4 4 0 1 1 8 0h4v4a4 4 0 0 1 0 8v4H3V5h4Zm4-2a2 2 0 0 0-1.886 2.667C9.222 5.973 9.5 7 9.5 7H5v12h12v-4.5s1.027.278 1.333.386a2 2 0 1 0 0-3.773c-.306.109-1.333.387-1.333.387V7h-4.5s.278-1.027.386-1.333A2 2 0 0 0 11 3Z"
    />
  </svg>
);
export default SvgPuzzle;
