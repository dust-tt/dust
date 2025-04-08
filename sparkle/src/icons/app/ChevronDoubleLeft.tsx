import type { SVGProps } from "react";
import * as React from "react";
const SvgChevronDoubleLeft = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 16.5 7.5 12 12 7.5l-2-2L3.5 12l6.5 6.5 2-2Z"
    />
    <path
      fill="currentColor"
      d="M19.5 16.5 15 12l4.5-4.5-2-2L11 12l6.5 6.5 2-2Z"
    />
  </svg>
);
export default SvgChevronDoubleLeft;
