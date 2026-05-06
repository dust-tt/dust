import type { SVGProps } from "react";
import * as React from "react";

const SvgToggle02Right = (props: SVGProps<SVGSVGElement>) => (
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
      d="M.965 12A5.035 5.035 0 0 1 6 6.965h8a1.035 1.035 0 0 1 0 2.07H6a2.965 2.965 0 1 0 0 5.93h8a1.035 1.035 0 0 1 0 2.07H6A5.035 5.035 0 0 1 .965 12"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M20.965 12a3.965 3.965 0 1 0-7.93 0 3.965 3.965 0 0 0 7.93 0m2.07 0a6.035 6.035 0 1 1-12.07 0 6.035 6.035 0 0 1 12.07 0"
    />
  </svg>
);
export default SvgToggle02Right;
