import type { SVGProps } from "react";
import * as React from "react";

const SvgAnthropic = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Anthropic_svg__a)">
      <rect width={24} height={24} fill="#F0EEE7" rx={6} />
      <path
        fill="#000"
        d="M15.983 4.765h-2.757l5.018 14H21zm-7.966 0L3 18.765h2.813l1.012-2.94h5.265l1.024 2.94h2.812l-5.028-14zm-.27 8.458L9.458 8.3l1.722 4.923z"
      />
    </g>
    <defs>
      <clipPath id="Anthropic_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAnthropic;
