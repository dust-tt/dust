import type { SVGProps } from "react";
import * as React from "react";
const SvgHexagon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m17 3 5 9-5 9H7l-5-9 5-9h10Z" />
  </svg>
);
export default SvgHexagon;
