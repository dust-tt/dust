import type { SVGProps } from "react";
import * as React from "react";

const SvgAtSign = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#at-sign_svg__a)">
      <path
        fill="currentColor"
        d="M16 6.965c.572 0 1.035.463 1.035 1.035v5a1.966 1.966 0 1 0 3.93 0v-1a8.964 8.964 0 1 0-3.514 7.118 1.035 1.035 0 0 1 1.258 1.643A11.034 11.034 0 1 1 23.035 12v1a4.036 4.036 0 0 1-7.299 2.373 5.035 5.035 0 1 1-.768-7.44c.034-.54.483-.968 1.032-.968M9.035 12a2.966 2.966 0 1 0 5.931 0 2.966 2.966 0 0 0-5.93 0"
      />
    </g>
    <defs>
      <clipPath id="at-sign_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgAtSign;
