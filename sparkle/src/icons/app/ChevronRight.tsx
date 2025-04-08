import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronRight = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12.5 12 8 7.5l2-2 6.5 6.5-6.5 6.5-2-2 4.5-4.5Z"
    />
  </svg>
);
export default SvgChevronRight;
