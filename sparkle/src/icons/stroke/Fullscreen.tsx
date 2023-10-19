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
      fillRule="evenodd"
      d="M2 21h10v-8H2v8Zm8-6H4v4h6v-4Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m12.5 7 2.043 2.043-2.25 2.25 1.414 1.414 2.25-2.25L18 12.5V7h-5.5Z"
    />
  </svg>
);
export default SvgFullscreen;
