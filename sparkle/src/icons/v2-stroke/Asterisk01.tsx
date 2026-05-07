import type { SVGProps } from "react";
import * as React from "react";

const SvgAsterisk01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#asterisk-01_svg__a)">
      <path
        fill="currentColor"
        d="M10.965 22v-7.501L5.66 19.803a1.035 1.035 0 0 1-1.464-1.464l5.304-5.304H2a1.035 1.035 0 0 1 0-2.07h7.501L4.197 5.66a1.035 1.035 0 0 1 1.464-1.464l5.304 5.304V2a1.035 1.035 0 0 1 2.07 0v7.501l5.304-5.304a1.035 1.035 0 0 1 1.464 1.464l-5.304 5.304H22a1.035 1.035 0 0 1 0 2.07h-7.501l5.304 5.304a1.035 1.035 0 0 1-1.464 1.464l-5.304-5.304V22a1.035 1.035 0 0 1-2.07 0"
      />
    </g>
    <defs>
      <clipPath id="asterisk-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAsterisk01;
