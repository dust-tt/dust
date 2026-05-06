import type { SVGProps } from "react";
import * as React from "react";

const SvgIntersectCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#intersect-circle_svg__a)">
      <path
        d="M20.965 15a5.965 5.965 0 1 0-11.93 0 5.965 5.965 0 0 0 11.93 0m2.07 0a8.035 8.035 0 1 1-16.07 0 8.035 8.035 0 0 1 16.07 0"
        opacity={0.4}
      />
      <path d="M14.965 9a5.965 5.965 0 1 0-11.93 0 5.965 5.965 0 0 0 11.93 0m2.07 0A8.035 8.035 0 1 1 .965 9a8.035 8.035 0 0 1 16.07 0" />
    </g>
    <defs>
      <clipPath id="intersect-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgIntersectCircle;
