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
      d="M3 13v8h8v-2.5H7.5l4.56-4.44-2.12-2.12L5.5 16.5V13H3ZM18.5 11H21V3h-8v2.5h3.5l-4.56 4.44 2.12 2.12L18.5 7.5V11Z"
    />
  </svg>
);
export default SvgFullscreen;
