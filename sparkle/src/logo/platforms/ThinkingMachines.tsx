import type { SVGProps } from "react";
import * as React from "react";

const SvgThinkingMachines = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#ThinkingMachines_svg__a)">
      <path
        fill="#E6E7E8"
        d="M21.867 0H2.133A2.133 2.133 0 0 0 0 2.133v19.734C0 23.045.955 24 2.133 24h19.734A2.133 2.133 0 0 0 24 21.867V2.133A2.133 2.133 0 0 0 21.867 0"
      />
      <path
        fill="#31373D"
        d="M18.4 4H5.6A1.6 1.6 0 0 0 4 5.6v12.8A1.6 1.6 0 0 0 5.6 20h12.8a1.6 1.6 0 0 0 1.6-1.6V5.6A1.6 1.6 0 0 0 18.4 4"
      />
    </g>
    <defs>
      <clipPath id="ThinkingMachines_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgThinkingMachines;
