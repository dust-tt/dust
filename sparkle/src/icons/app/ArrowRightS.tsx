import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowRightS = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m16 12-6 6V6l6 6Z" />
  </svg>
);
export default SvgArrowRightS;
