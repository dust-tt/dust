import type { SVGProps } from "react";
import * as React from "react";
const SvgFullscreen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M3 15v6h6v-2H6.414l4.293-4.293-1.414-1.414L5 17.586V15H3ZM19 9h2V3h-6v2h2.586l-4.293 4.293 1.414 1.414L19 6.414V9Z"
    />
  </svg>
);
export default SvgFullscreen;
