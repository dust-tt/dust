import type { SVGProps } from "react";
import * as React from "react";
const SvgCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m10 15 9-9 1.5 1.5L10 18l-6.5-6.5L5 10l5 5Z" />
  </svg>
);
export default SvgCheck;
