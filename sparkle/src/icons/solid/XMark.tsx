import * as React from "react";
import type { SVGProps } from "react";
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
      d="m12 10 5-5 2 2-5 5 5 5-2 2-5-5-5 5-2-2 5-5-5-5 2-2 5 5Z"
    />
  </svg>
);
export default SvgXMark;
