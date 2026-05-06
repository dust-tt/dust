import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleBrokenUpLeft = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#arrow-circle-broken-up-left_svg__a)">
      <path
        d="M4.197 4.197c4.31-4.31 11.296-4.31 15.606 0a11.03 11.03 0 0 1 2.857 10.66 1.035 1.035 0 1 1-1.999-.535 8.96 8.96 0 0 0-2.322-8.661 8.964 8.964 0 0 0-12.678 0 8.964 8.964 0 0 0 0 12.678 8.96 8.96 0 0 0 8.661 2.322 1.035 1.035 0 1 1 .535 2 11.03 11.03 0 0 1-10.66-2.858c-4.309-4.31-4.309-11.296 0-15.606"
        opacity={0.4}
      />
      <path d="M7.965 15V9c0-.572.463-1.035 1.035-1.035h6a1.035 1.035 0 0 1 0 2.07h-3.502l8.233 8.234a1.034 1.034 0 1 1-1.463 1.462l-8.233-8.233V15a1.035 1.035 0 0 1-2.07 0" />
    </g>
    <defs>
      <clipPath id="arrow-circle-broken-up-left_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleBrokenUpLeft;
