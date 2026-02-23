import type { SVGProps } from "react";
import * as React from "react";

const SvgMoon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 25"
    {...props}
  >
    <path
      fill="currentColor"
      d="M10 7.875a7 7 0 0 0 12 4.9v.1c0 5.523-4.477 10-10 10s-10-4.477-10-10 4.477-10 10-10h.1a6.98 6.98 0 0 0-2.1 5"
    />
  </svg>
);
export default SvgMoon;
