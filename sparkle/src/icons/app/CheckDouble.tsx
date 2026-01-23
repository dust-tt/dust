import type { SVGProps } from "react";
import * as React from "react";
const SvgCheckDouble = (props: SVGProps<SVGSVGElement>) => (
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
      d="m9.5 16-1.999 1.999L1 11.5l2-2L9.5 16ZM23 8.5l-9.499 9.499L7 11.5l2-2 4.5 4.5L21 6.5l2 2Z"
    />
    <path fill="currentColor" d="m16.501 8.5-3 3L11.5 9.501 14.501 6.5l2 2Z" />
  </svg>
);
export default SvgCheckDouble;
