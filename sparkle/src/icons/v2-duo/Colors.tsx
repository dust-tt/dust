import type { SVGProps } from "react";
import * as React from "react";

const SvgColors = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#colors_svg__a)">
      <path
        d="M20.965 16a4.97 4.97 0 0 0-3.658-4.79 1.035 1.035 0 0 1 .544-1.999 7.035 7.035 0 1 1-6.542 12.032 1.035 1.035 0 1 1 1.381-1.542A4.965 4.965 0 0 0 20.964 16"
        opacity={0.4}
      />
      <path d="M12.965 16q-.002-.525-.107-1.02a7.03 7.03 0 0 1-6.96-3.48A4.967 4.967 0 0 0 8 20.965 4.965 4.965 0 0 0 12.965 16m4-8a4.965 4.965 0 1 0-9.93 0 4.965 4.965 0 0 0 9.93 0m2.07 0a7.03 7.03 0 0 1-4.179 6.428A7.035 7.035 0 1 1 5.142 9.57 7.035 7.035 0 1 1 19.036 8" />
    </g>
    <defs>
      <clipPath id="colors_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgColors;
