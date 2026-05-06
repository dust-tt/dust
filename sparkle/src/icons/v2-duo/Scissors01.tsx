import type { SVGProps } from "react";
import * as React from "react";

const SvgScissors01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.769 7.768a1.034 1.034 0 0 1 1.463 0l11.5 11.5a1.034 1.034 0 1 1-1.463 1.463l-11.5-11.5a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M7.965 18a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m0-12a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m2.07 12a4.035 4.035 0 1 1-2.01-3.49L19.27 3.27A1.034 1.034 0 1 1 20.73 4.73L9.488 15.974c.347.595.547 1.287.547 2.026m0-12a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0"
    />
  </svg>
);
export default SvgScissors01;
