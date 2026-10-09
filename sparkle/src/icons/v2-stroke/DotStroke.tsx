import * as React from "react";
import type { SVGProps } from "react";
const SvgDotStroke = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0m2 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0"
    />
  </svg>
);
export default SvgDotStroke;
