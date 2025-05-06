import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronDown = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 12.5 16.5 8l2 2-6.5 6.5L5.5 10l2-2 4.5 4.5Z"
    />
  </svg>
);
export default SvgChevronDown;
