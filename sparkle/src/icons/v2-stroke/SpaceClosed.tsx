import type { SVGProps } from "react";
import * as React from "react";

const SvgSpaceClosed = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18 12a6 6 0 1 0-12 0 6 6 0 0 0 12 0m2 0a8 8 0 1 1-16 0 8 8 0 0 1 16 0"
    />
  </svg>
);
export default SvgSpaceClosed;
