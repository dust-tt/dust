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
    <path fill="currentColor" d="M18 10.5v3H6v-3h12Z" />
  </svg>
);
export default SvgDash;
