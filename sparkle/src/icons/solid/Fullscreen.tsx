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
    <path fill="currentColor" d="M22 3H2v8h2V5h16v14h-6v2h8V3Z" />
    <path
      fill="currentColor"
      d="M2 21h10v-8H2v8ZM14.543 9.043 12.5 7H18v5.5l-2.043-2.043-2.25 2.25-1.414-1.414 2.25-2.25Z"
    />
  </svg>
);
export default SvgFullscreen;
