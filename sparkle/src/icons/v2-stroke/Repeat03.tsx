import type { SVGProps } from "react";
import * as React from "react";

const SvgRepeat03 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#repeat-03_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a5.97 5.97 0 0 0-3.41-5.392 1.035 1.035 0 0 1 .89-1.87A8.035 8.035 0 0 1 15 20.035h-2.503l1.233 1.233a1.034 1.034 0 1 1-1.462 1.463l-3-3a1.034 1.034 0 0 1 0-1.463l3-3a1.034 1.034 0 1 1 1.462 1.463l-1.233 1.234H15A5.965 5.965 0 0 0 20.965 12m-20 0A8.035 8.035 0 0 1 9 3.965h2.502L10.269 2.73a1.034 1.034 0 1 1 1.462-1.463l3 3a1.034 1.034 0 0 1 0 1.463l-3 3a1.034 1.034 0 1 1-1.462-1.463l1.233-1.233H9a5.965 5.965 0 0 0-2.556 11.357 1.035 1.035 0 0 1-.888 1.87A8.04 8.04 0 0 1 .965 12"
      />
    </g>
    <defs>
      <clipPath id="repeat-03_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgRepeat03;
