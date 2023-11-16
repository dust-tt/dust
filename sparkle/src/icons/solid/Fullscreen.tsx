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
      d="M2 14v8h8v-2.5H6.5l4.56-4.44-2.12-2.12L4.5 17.5V14H2ZM19.5 10H22V2h-8v2.5h3.5l-4.56 4.44 2.12 2.12L19.5 6.5V10Z"
    />
  </svg>
);
export default SvgFullscreen;
