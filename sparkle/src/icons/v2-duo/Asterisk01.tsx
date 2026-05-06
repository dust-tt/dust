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
    <g fill="currentColor" clipPath="url(#asterisk-01_svg__a)">
      <path
        d="M18.34 4.197a1.035 1.035 0 0 1 1.463 1.463L13.463 12l6.34 6.339a1.035 1.035 0 0 1-1.464 1.464L12 13.463l-6.338 6.34a1.035 1.035 0 1 1-1.463-1.464l6.339-6.34-6.34-6.339a1.034 1.034 0 1 1 1.464-1.463l6.338 6.34z"
        opacity={0.4}
      />
      <path d="M10.965 22v-8.965H2a1.035 1.035 0 0 1 0-2.07h8.965V2a1.035 1.035 0 0 1 2.07 0v8.965H22a1.035 1.035 0 0 1 0 2.07h-8.965V22a1.035 1.035 0 0 1-2.07 0" />
    </g>
    <defs>
      <clipPath id="asterisk-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAsterisk01;
