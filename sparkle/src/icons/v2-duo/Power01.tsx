import type { SVGProps } from "react";
import * as React from "react";

const SvgPower01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M10.965 12V2a1.035 1.035 0 0 1 2.07 0v10a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M17.628 5.908a1.035 1.035 0 0 1 1.464 0 10.035 10.035 0 1 1-14.194 0 1.035 1.035 0 1 1 1.464 1.463A7.967 7.967 0 0 0 7.57 19.626 7.965 7.965 0 0 0 17.628 7.372a1.035 1.035 0 0 1 0-1.464"
    />
  </svg>
);
export default SvgPower01;
