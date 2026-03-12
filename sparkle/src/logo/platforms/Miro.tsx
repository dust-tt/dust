import type { SVGProps } from "react";
import * as React from "react";

const SvgMiro = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fillRule="evenodd"
    strokeLinejoin="round"
    strokeMiterlimit={2}
    clipRule="evenodd"
    viewBox="0 0 512 512"
    width="1em"
    height="1em"
    {...props}
  >
    <g fillRule="nonzero">
      <path
        fill="#fd3"
        d="M6 131C6 61.965 61.965 6 131 6h249.998c69.035 0 125 55.965 125 125v249.998c0 69.035-55.965 125-125 125H131c-69.035 0-125-55.965-125-125z"
      />
      <path d="M338.41 101.312h-45.388l37.824 66.457-83.212-66.457h-45.389l41.607 81.226-86.995-81.226h-45.389l45.389 103.392-45.389 206.763h45.389l86.995-221.534-41.607 221.534h45.389l83.212-236.304-37.824 236.304h45.389l83.212-258.47-83.212-51.685z" />
    </g>
  </svg>
);
export default SvgMiro;
