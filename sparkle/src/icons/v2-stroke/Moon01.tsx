import type { SVGProps } from "react";
import * as React from "react";

const SvgMoon01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#moon-01_svg__a)">
      <path
        fill="currentColor"
        d="M6.196 6.307q.001-1.001.166-1.958A9.427 9.427 0 1 0 19.65 17.637q-.956.166-1.956.168c-6.35 0-11.497-5.148-11.497-11.497m2.07 0a9.427 9.427 0 0 0 9.427 9.426 9.4 9.4 0 0 0 3.88-.832 1.035 1.035 0 0 1 1.37 1.37 11.5 11.5 0 0 1-10.481 6.764c-6.35 0-11.497-5.148-11.497-11.497A11.5 11.5 0 0 1 7.729 1.057a1.035 1.035 0 0 1 1.37 1.37 9.4 9.4 0 0 0-.832 3.88"
      />
    </g>
    <defs>
      <clipPath id="moon-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMoon01;
