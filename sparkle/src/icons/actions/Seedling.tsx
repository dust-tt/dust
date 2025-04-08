import type { SVGProps } from "react";
import * as React from "react";
const SvgSeedling = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M5.998 3a7.002 7.002 0 0 1 6.913 5.895A6.479 6.479 0 0 1 17.498 7h4.5v2.5a6.5 6.5 0 0 1-6.5 6.5h-2.5v5h-2v-8h-2a7 7 0 0 1-7-7V3h4Zm14 6h-2.5a4.5 4.5 0 0 0-4.5 4.5v.5h2.5a4.5 4.5 0 0 0 4.5-4.5V9Zm-14-4h-2v1a5 5 0 0 0 5 5h2v-1a5 5 0 0 0-5-5Z"
    />
  </svg>
);
export default SvgSeedling;
