import type { SVGProps } from "react";
import * as React from "react";

const SvgTarget02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#target-02_svg__a)">
      <path
        d="M10.965 22v-4a1.035 1.035 0 0 1 2.07 0v4a1.035 1.035 0 0 1-2.07 0M6 10.965a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zm16 0a1.035 1.035 0 0 1 0 2.07h-4a1.035 1.035 0 0 1 0-2.07zM10.965 6V2a1.035 1.035 0 0 1 2.07 0v4a1.035 1.035 0 0 1-2.07 0"
        opacity={0.4}
      />
      <path d="M18.965 12a6.965 6.965 0 1 0-13.93 0 6.965 6.965 0 0 0 13.93 0m2.07 0a9.035 9.035 0 1 1-18.07 0 9.035 9.035 0 0 1 18.07 0" />
    </g>
    <defs>
      <clipPath id="target-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgTarget02;
