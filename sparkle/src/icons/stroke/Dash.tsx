import type { SVGProps } from "react";
import * as React from "react";
const SvgDash = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M18 11v2H6v-2h12Z" />
  </svg>
);
export default SvgDash;
