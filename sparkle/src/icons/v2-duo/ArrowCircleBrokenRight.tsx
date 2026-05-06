import type { SVGProps } from "react";
import * as React from "react";

const SvgArrowCircleBrokenRight = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#arrow-circle-broken-right_svg__a)">
      <path
        d="M20.965 12A8.965 8.965 0 0 0 4.234 7.519 1.035 1.035 0 0 1 2.443 6.48 11.03 11.03 0 0 1 12 .965c6.095 0 11.035 4.94 11.035 11.035S18.095 23.035 12 23.035a11.03 11.03 0 0 1-9.557-5.516 1.035 1.035 0 0 1 1.79-1.038A8.965 8.965 0 0 0 20.965 12"
        opacity={0.4}
      />
      <path d="M11.269 7.268a1.034 1.034 0 0 1 1.462 0l4 4a1.034 1.034 0 0 1 0 1.463l-4 4a1.034 1.034 0 1 1-1.462-1.463l2.233-2.233H2a1.035 1.035 0 0 1 0-2.07h11.502L11.269 8.73a1.034 1.034 0 0 1 0-1.463" />
    </g>
    <defs>
      <clipPath id="arrow-circle-broken-right_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgArrowCircleBrokenRight;
