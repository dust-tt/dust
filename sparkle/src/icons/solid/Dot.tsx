import type { SVGProps } from "react";
import * as React from "react";
const SvgDot = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
  </svg>
);
export default SvgDot;
