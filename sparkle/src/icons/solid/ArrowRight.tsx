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
    <path fill="currentColor" d="M12 13.5H4v-3h8V4l8 8-8 8v-6.5Z" />
  </svg>
);
export default SvgArrowRight;
