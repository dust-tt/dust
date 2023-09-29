import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 21v-3H7a1 1 0 0 1-1-1V7H3a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7 16a1 1 0 0 0 1 1h12.99c.558 0 1.007-.451 1.007-1.008L22 3.008C22 2.45 21.549 2 20.992 2H8.008C7.45 2 7 2.451 7 3.007V16ZM19.502 4.5l-.002 10h-10v-10h10.002Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboard;
