import type { SVGProps } from "react";
import * as React from "react";

const SvgMark = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#mark_svg__a)">
      <path
        fill="currentColor"
        d="M10.965 22v-1.026a9.034 9.034 0 0 1-7.939-7.939H2a1.035 1.035 0 0 1 0-2.07h1.026a9.035 9.035 0 0 1 7.939-7.94V2a1.035 1.035 0 0 1 2.07 0v1.025a9.035 9.035 0 0 1 7.939 7.94H22a1.035 1.035 0 0 1 0 2.07h-1.026a9.034 9.034 0 0 1-7.939 7.939V22a1.035 1.035 0 0 1-2.07 0M12 5.035a6.965 6.965 0 1 0 0 13.93 6.965 6.965 0 0 0 0-13.93M13.965 12a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m2.07 0a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0"
      />
    </g>
    <defs>
      <clipPath id="mark_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMark;
