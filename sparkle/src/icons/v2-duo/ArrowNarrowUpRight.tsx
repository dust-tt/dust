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
      d="M17.269 5.268a1.034 1.034 0 1 1 1.463 1.463l-12 12a1.034 1.034 0 1 1-1.463-1.463z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M16.965 14V7.035H10a1.035 1.035 0 0 1 0-2.07h8c.572 0 1.035.463 1.035 1.035v8a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgArrowNarrowUpRight;
