import type { SVGProps } from "react";
import * as React from "react";

const SvgLink01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14.769 7.768a1.034 1.034 0 1 1 1.462 1.463l-7 7a1.034 1.034 0 1 1-1.463-1.463z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M4.904 10.561a1.035 1.035 0 0 1 1.464 1.464l-1.414 1.414a3.965 3.965 0 0 0 5.607 5.607l1.414-1.414a1.035 1.035 0 0 1 1.464 1.464l-1.414 1.414a6.036 6.036 0 0 1-8.535-8.535zm7.071-7.071a6.036 6.036 0 0 1 8.535 8.535l-1.414 1.414a1.035 1.035 0 0 1-1.464-1.464l1.414-1.414a3.965 3.965 0 0 0-5.607-5.607l-1.414 1.414a1.035 1.035 0 0 1-1.464-1.464z"
    />
  </svg>
);
export default SvgLink01;
