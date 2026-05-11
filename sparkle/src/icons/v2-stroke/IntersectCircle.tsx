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
    <g clipPath="url(#intersect-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 15a5.97 5.97 0 0 0-3.94-5.612 8.033 8.033 0 0 1-7.637 7.636A5.967 5.967 0 0 0 20.965 15m-6.001-5.965a5.965 5.965 0 0 0-5.929 5.929 5.963 5.963 0 0 0 5.929-5.929M23.035 15a8.035 8.035 0 0 1-15.86 1.824A8.036 8.036 0 0 1 9 .964a8.036 8.036 0 0 1 7.824 6.21A8.04 8.04 0 0 1 23.035 15m-20-6a5.97 5.97 0 0 0 3.94 5.611 8.035 8.035 0 0 1 7.636-7.636A5.966 5.966 0 0 0 3.035 9"
      />
    </g>
    <defs>
      <clipPath id="intersect-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgIntersectCircle;
