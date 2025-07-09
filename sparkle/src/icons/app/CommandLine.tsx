import type { SVGProps } from "react";
import * as React from "react";
const SvgCommandLine = (props: SVGProps<SVGSVGElement>) => (
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
      d="M3 3h18a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm9 12v2h6v-2h-6Zm-3.586-3-2.828 2.828L7 16.243 11.243 12 7 7.757 5.586 9.172 8.414 12Z"
    />
  </svg>
);
export default SvgCommandLine;
