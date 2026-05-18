import type { SVGProps } from "react";
import * as React from "react";

const SvgMouse = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.965 9a5.965 5.965 0 1 0-11.93 0v6a5.965 5.965 0 1 0 11.93 0zm-7 0V6a1.035 1.035 0 0 1 2.07 0v3a1.035 1.035 0 0 1-2.07 0m9.07 6a8.035 8.035 0 0 1-16.07 0V9a8.035 8.035 0 0 1 16.07 0z"
    />
  </svg>
);
export default SvgMouse;
