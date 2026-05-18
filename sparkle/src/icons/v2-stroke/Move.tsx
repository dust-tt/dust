import type { SVGProps } from "react";
import * as React from "react";

const SvgMove = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#move_svg__a)">
      <path
        fill="currentColor"
        d="M11.347 1.197a1.035 1.035 0 0 1 1.384.072l3 3a1.034 1.034 0 1 1-1.463 1.463l-1.233-1.234v6.467h6.467l-1.233-1.233a1.034 1.034 0 1 1 1.462-1.463l3 3a1.034 1.034 0 0 1 0 1.463l-3 3a1.034 1.034 0 1 1-1.463-1.463l1.234-1.234h-6.467v6.467l1.233-1.233a1.034 1.034 0 1 1 1.463 1.463l-3 3a1.034 1.034 0 0 1-1.463 0l-3-3a1.034 1.034 0 1 1 1.463-1.463l1.234 1.233v-6.467H4.498l1.233 1.234a1.034 1.034 0 1 1-1.463 1.463l-3-3a1.034 1.034 0 0 1 0-1.463l3-3a1.034 1.034 0 1 1 1.463 1.463l-1.233 1.233h6.467V4.498L9.73 5.732a1.034 1.034 0 1 1-1.463-1.463l3-3z"
      />
    </g>
    <defs>
      <clipPath id="move_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMove;
