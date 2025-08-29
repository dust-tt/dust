import type { SVGProps } from "react";
import * as React from "react";
const SvgHeading = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15 11.057V5.021h3v15.088h-3v-6.036H9v6.036H6V5.021h3v6.036h6Z"
    />
  </svg>
);
export default SvgHeading;
