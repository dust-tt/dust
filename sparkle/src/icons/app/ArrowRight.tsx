import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="m15.5 10.5-5-5 2-2L21 12l-8.5 8.5-2-2 5-5H3v-3h12.5Z"
    />
  </svg>
);
export default SvgArrowRight;
