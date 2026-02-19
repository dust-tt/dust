import type { SVGProps } from "react";
import * as React from "react";

const SvgExpandHorizontal = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="#1C222D" clipPath="url(#expand-horizontal_svg__a)">
      <path d="M5.5 13.5 7 15l-2 2-5-5 5-5 2 2-1.5 1.5H10v3zM19 17l-2-2 1.5-1.5H14v-3h4.5L17 9l2-2 5 5z" />
    </g>
    <defs>
      <clipPath id="expand-horizontal_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgExpandHorizontal;
