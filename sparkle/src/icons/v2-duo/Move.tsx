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
    <g fill="currentColor" clipPath="url(#move_svg__a)">
      <path
        d="M10.965 22v-8.965H2a1.035 1.035 0 0 1 0-2.07h8.965V2a1.035 1.035 0 0 1 2.07 0v8.965H22a1.035 1.035 0 0 1 0 2.07h-8.965V22a1.035 1.035 0 0 1-2.07 0"
        opacity={0.4}
      />
      <path d="M14.269 18.269a1.034 1.034 0 1 1 1.463 1.463l-3 3a1.034 1.034 0 0 1-1.463 0l-3-3a1.034 1.034 0 1 1 1.463-1.463L12 20.537zm-10-10a1.034 1.034 0 1 1 1.463 1.463L3.463 12l2.269 2.269a1.034 1.034 0 1 1-1.463 1.463l-3-3a1.034 1.034 0 0 1 0-1.463zm14 0a1.034 1.034 0 0 1 1.463 0l3 3a1.034 1.034 0 0 1 0 1.463l-3 3a1.034 1.034 0 1 1-1.463-1.463L20.538 12l-2.269-2.268a1.034 1.034 0 0 1 0-1.463m-6.922-7.072a1.035 1.035 0 0 1 1.385.072l3 3a1.034 1.034 0 1 1-1.463 1.463L12 3.463 9.732 5.732a1.034 1.034 0 1 1-1.463-1.463l3-3z" />
    </g>
    <defs>
      <clipPath id="move_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMove;
