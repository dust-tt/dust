import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowNarrowUpRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.035 14a1.035 1.035 0 0 1-2.07 0V8.498L6.73 18.731A1.034 1.034 0 1 1 5.27 17.27L15.502 7.035H10a1.035 1.035 0 0 1 0-2.07h8c.572 0 1.035.463 1.035 1.035z"
    />
  </svg>
);
export default SvgArrowNarrowUpRight;
