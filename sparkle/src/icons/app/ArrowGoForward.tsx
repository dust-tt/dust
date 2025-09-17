import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowGoForward = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={0.5}
      d="m14.792 3.184 5.368 4.5.23.191-.23.191-5.368 4.5-.41.345V9.025h-4.224c-2.825 0-5.119 2.304-5.119 5.15 0 2.845 2.294 5.15 5.12 5.15h8.302v2.3h-8.303c-4.092 0-7.408-3.337-7.408-7.45 0-4.113 3.316-7.45 7.408-7.45h4.224V2.839l.41.345Z"
    />
  </svg>
);
export default SvgArrowGoForward;
