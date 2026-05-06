import type { SVGProps } from "react";
import * as React from "react";

const SvgAnchor = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#anchor_svg__a)">
      <path
        d="M13.965 5a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m2.07 0a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0"
        opacity={0.4}
      />
      <path d="M10.965 8a1.035 1.035 0 0 1 2.07 0v12.902a8.96 8.96 0 0 0 5.304-2.563 8.96 8.96 0 0 0 2.563-5.304H19a1.035 1.035 0 0 1 0-2.07h3c.572 0 1.035.463 1.035 1.035a11.035 11.035 0 0 1-22.07 0A1.034 1.034 0 0 1 2 10.965h3a1.035 1.035 0 0 1 0 2.07H3.098A8.96 8.96 0 0 0 5.66 18.34a8.96 8.96 0 0 0 5.304 2.563z" />
    </g>
    <defs>
      <clipPath id="anchor_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAnchor;
