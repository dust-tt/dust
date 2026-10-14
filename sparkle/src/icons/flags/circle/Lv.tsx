import type { SVGProps } from "react";
import * as React from "react";

const SvgLv = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#A2001D"
      d="M10 0C5.378 0 1.49 3.134.343 7.391h19.31C18.508 3.134 14.62 0 10 0M10 20c4.62 0 8.507-3.134 9.655-7.391H.344C1.49 16.866 5.379 20 9.999 20"
    />
  </svg>
);
export default SvgLv;
