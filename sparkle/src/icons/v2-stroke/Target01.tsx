import type { SVGProps } from "react";
import * as React from "react";

const SvgTarget01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#target-01_svg__a)">
      <path
        fill="currentColor"
        d="M12 .965c6.095 0 11.035 4.94 11.035 11.035S18.095 23.035 12 23.035.965 18.095.965 12 5.905.965 12 .965M10.965 6V3.096a8.965 8.965 0 0 0-7.868 7.869H6a1.035 1.035 0 0 1 0 2.07H3.097a8.964 8.964 0 0 0 7.868 7.868V18a1.035 1.035 0 0 1 2.07 0v2.903a8.964 8.964 0 0 0 7.868-7.868H18a1.035 1.035 0 0 1 0-2.07h2.903a8.965 8.965 0 0 0-7.868-7.87V6a1.035 1.035 0 0 1-2.07 0"
      />
    </g>
    <defs>
      <clipPath id="target-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgTarget01;
