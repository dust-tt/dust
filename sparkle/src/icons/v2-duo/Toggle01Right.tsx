import type { SVGProps } from "react";
import * as React from "react";

const SvgToggle01Right = (props: SVGProps<SVGSVGElement>) => (
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
      d="M20.965 12A3.965 3.965 0 0 0 17 8.035H7a3.965 3.965 0 1 0 0 7.93h10A3.965 3.965 0 0 0 20.965 12m2.07 0A6.035 6.035 0 0 1 17 18.035H7a6.035 6.035 0 0 1 0-12.07h10A6.035 6.035 0 0 1 23.035 12"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M20.965 12a3.965 3.965 0 1 0-7.93 0 3.965 3.965 0 0 0 7.93 0m2.07 0a6.035 6.035 0 1 1-12.07 0 6.035 6.035 0 0 1 12.07 0"
    />
  </svg>
);
export default SvgToggle01Right;
