import type { SVGProps } from "react";
import * as React from "react";
const SvgTools = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7 12.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9ZM22 21H12l5-8 5 8ZM11 11H3V3h8v8Zm7-5h3v2h-3v3h-2V8h-3V6h3V3h2v3Z"
    />
  </svg>
);
export default SvgTools;
