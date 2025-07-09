import type { SVGProps } from "react";
import * as React from "react";
const SvgMagic = (props: SVGProps<SVGSVGElement>) => (
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
      d="m16.02 17.435 1.415-1.414 4.243 4.242-1.415 1.415-4.242-4.243ZM4.364 4.657l4.984 1.058a2 2 0 0 0 1.394-.213l4.61-2.586.354 5.028a2 2 0 0 0 .677 1.363l4.019 3.522-4.83 1.912a2 2 0 0 0-1.123 1.123l-1.913 4.83-3.522-4.018a2 2 0 0 0-1.363-.677l-5.027-.355 2.586-4.61a2 2 0 0 0 .212-1.393L4.364 4.657Z"
    />
  </svg>
);
export default SvgMagic;
