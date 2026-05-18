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
    <g clipPath="url(#colors_svg__a)">
      <path
        fill="currentColor"
        d="M12.965 16q-.002-.525-.107-1.02a7.03 7.03 0 0 1-6.96-3.48A4.967 4.967 0 0 0 8 20.965 4.965 4.965 0 0 0 12.965 16m2.07 0a7 7 0 0 1-1.484 4.318A4.965 4.965 0 1 0 18.1 11.5a7.06 7.06 0 0 1-3.245 2.928 7 7 0 0 1 .18 1.572m1.93-8a4.965 4.965 0 1 0-9.93 0 4.965 4.965 0 0 0 9.93 0m2.07 0c0 .54-.063 1.065-.179 1.57A7.035 7.035 0 1 1 12 21.786 7.035 7.035 0 1 1 5.143 9.57 7.035 7.035 0 1 1 19.036 8"
      />
    </g>
    <defs>
      <clipPath id="colors_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgColors;
