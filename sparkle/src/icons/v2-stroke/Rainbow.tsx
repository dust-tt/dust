import type { SVGProps } from "react";
import * as React from "react";

const SvgRainbow = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 3.875c6.075 0 11 4.925 11 11v4.5a1 1 0 1 1-2 0v-4.5a9 9 0 1 0-18 0v4.5a1 1 0 1 1-2 0v-4.5c0-6.075 4.925-11 11-11"
    />
    <path
      fill="currentColor"
      d="M12 7.875a7 7 0 0 1 7 7v4.5a1 1 0 1 1-2 0v-4.5a5 5 0 0 0-10 0v4.5a1 1 0 1 1-2 0v-4.5a7 7 0 0 1 7-7"
    />
    <path
      fill="currentColor"
      d="M12 11.875a3 3 0 0 1 3 3v4.5a1 1 0 1 1-2 0v-4.5a1 1 0 1 0-2 0v4.5a1 1 0 1 1-2 0v-4.5a3 3 0 0 1 3-3"
    />
  </svg>
);
export default SvgRainbow;
