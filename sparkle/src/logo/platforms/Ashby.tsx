import type { SVGProps } from "react";
import * as React from "react";

const SvgAshby = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Ashby_svg__a)">
      <rect width={24} height={24} fill="#473BCE" rx={6} />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M8.393 19.553v.62h-5.12v-.62c1.326 0 1.857-.296 2.334-1.589l4.987-14.136h2.361l5.491 14.136c.53 1.32.796 1.589 1.937 1.589v.62h-8.05v-.62c1.91 0 2.071-.175 1.498-1.589l-1.46-3.877h-4.43l-1.3 3.796c-.379 1.285-.296 1.67 1.752 1.67m1.644-11.605-1.803 5.304h3.82z"
        clipRule="evenodd"
      />
    </g>
    <defs>
      <clipPath id="Ashby_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAshby;
