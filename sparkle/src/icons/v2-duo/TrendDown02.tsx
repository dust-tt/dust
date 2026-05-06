import type { SVGProps } from "react";
import * as React from "react";

const SvgTrendDown02 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M6.269 6.268a1.034 1.034 0 0 1 1.463 0l10 10a1.034 1.034 0 1 1-1.463 1.463l-10-10a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M15.965 7a1.035 1.035 0 0 1 2.07 0v10c0 .572-.463 1.035-1.035 1.035H7a1.035 1.035 0 0 1 0-2.07h8.965z"
    />
  </svg>
);
export default SvgTrendDown02;
