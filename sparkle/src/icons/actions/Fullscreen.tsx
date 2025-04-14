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
      d="M4 14v6h6v-2H7.414l4.293-4.293-1.414-1.414L6 16.586V14H4ZM18 10h2V4h-6v2h2.586l-4.293 4.293 1.414 1.414L18 7.414V10Z"
    />
  </svg>
);
export default SvgFullscreen;
