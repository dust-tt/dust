import type { SVGProps } from "react";
import * as React from "react";
const SvgXMark = (props: SVGProps<SVGSVGElement>) => (
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
      d="m12 10.5 4.95-5L18.5 7l-5 5 5 4.95-1.55 1.55-4.95-5-5 5L5.5 17l5-5-5-5 1.55-1.5 4.95 5Z"
    />
  </svg>
);
export default SvgXMark;
