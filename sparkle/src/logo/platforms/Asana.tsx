import type { SVGProps } from "react";
import * as React from "react";

const SvgAsana = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Asana_svg__a)">
      <rect width={24} height={24} fill="#F7F7F7" rx={6} />
      <circle cx={12} cy={7.5} r={4} fill="#F06A6A" />
      <circle cx={17} cy={16.5} r={4} fill="#F06A6A" />
      <circle cx={7} cy={16.5} r={4} fill="#F06A6A" />
    </g>
    <defs>
      <clipPath id="Asana_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAsana;
