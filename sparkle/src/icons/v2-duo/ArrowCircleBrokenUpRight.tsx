import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleBrokenUpRight = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#arrow-circle-broken-up-right_svg__a)">
      <path
        d="M4.198 4.197c4.309-4.31 11.296-4.31 15.605 0s4.31 11.296 0 15.606a11.03 11.03 0 0 1-10.66 2.857 1.035 1.035 0 1 1 .535-1.999 8.96 8.96 0 0 0 8.661-2.322 8.964 8.964 0 0 0 0-12.678 8.964 8.964 0 0 0-12.678 0 8.96 8.96 0 0 0-2.322 8.661 1.035 1.035 0 1 1-1.999.534A11.03 11.03 0 0 1 4.198 4.197"
        opacity={0.4}
      />
      <path d="M16.035 15a1.035 1.035 0 0 1-2.07 0v-3.502L5.73 19.731a1.034 1.034 0 1 1-1.463-1.462l8.234-8.234H9a1.035 1.035 0 0 1 0-2.07h6c.572 0 1.035.463 1.035 1.035z" />
    </g>
    <defs>
      <clipPath id="arrow-circle-broken-up-right_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleBrokenUpRight;
