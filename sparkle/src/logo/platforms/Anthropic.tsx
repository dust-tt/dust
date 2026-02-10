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
      <path
        fill="#F0EEE7"
        d="M0 4a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4Z"
      />
      <path
        fill="#000"
        d="M15.982 4.765h-2.756l5.018 14H21l-5.018-14Zm-7.964 0L3 18.765h2.813l1.012-2.94h5.265l1.024 2.94h2.812l-5.028-14h-2.88Zm-.27 8.458L9.457 8.3l1.72 4.923h-3.43Z"
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
