import type { SVGProps } from "react";
import * as React from "react";
const SvgBookOpen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 20h-9V7a3 3 0 0 1 3-3h6zm-11 0H2V4h6a3 3 0 0 1 3 3zm0 0h2v2h-2z"
    />
  </svg>
);
export default SvgBookOpen;
