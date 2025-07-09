import type { SVGProps } from "react";
import * as React from "react";
const SvgFullscreenExit = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15.5 8.5H21V11h-8V3h2.5v5.5ZM11 13v8H8.5v-5.5H3V13h8Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m14.94 6.94 5-5 2.12 2.12-5 5-1.56-.56-.56-1.56ZM9.06 17.06l-5 5L2 20l4.94-5.06 1.56.56.56 1.56Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgFullscreenExit;
