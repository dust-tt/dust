import type { SVGProps } from "react";
import * as React from "react";

const SvgCommand = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 16H6a2 2 0 1 0 2 2zm12 2a2 2 0 0 0-2-2h-2v2a2 2 0 1 0 4 0m-10-4h4v-4h-4zM8 6a2 2 0 1 0-2 2h2zm12 0a2 2 0 1 0-4 0v2h2a2 2 0 0 0 2-2m2 0a4 4 0 0 1-4 4h-2v4h2a4 4 0 1 1-4 4v-2h-4v2a4 4 0 1 1-4-4h2v-4H6a4 4 0 1 1 4-4v2h4V6a4 4 0 0 1 8 0"
    />
  </svg>
);
export default SvgCommand;
