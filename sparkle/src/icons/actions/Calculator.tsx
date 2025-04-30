import type { SVGProps } from "react";
import * as React from "react";
const SvgCalculator = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 2v20H3V2h18ZM5 4v16h14V4H5Zm2 2h10v4H7V6Zm0 6h2v2H7v-2Zm0 4h2v2H7v-2Zm4-4h2v2h-2v-2Zm0 4h2v2h-2v-2Zm4-4h2v6h-2v-6Z"
    />
  </svg>
);
export default SvgCalculator;
