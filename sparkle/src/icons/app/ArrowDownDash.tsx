import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowDownDash = (props: SVGProps<SVGSVGElement>) => (
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
      d="m13.5 17.5 5-5 2 2L12 23l-8.5-8.5 2-2 5 5V7h3v10.5ZM16 5H8V2h8v3Z"
    />
  </svg>
);
export default SvgArrowDownDash;
