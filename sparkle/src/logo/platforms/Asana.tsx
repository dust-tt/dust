import type { SVGProps } from "react";
import * as React from "react";
const SvgAsana = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#F06A6A"
      d="M7 12.6A3.9 3.9 0 1 1 7 20.4 3.9 3.9 0 0 1 7 12.6ZM17 12.6a3.9 3.9 0 1 1 0 7.801 3.9 3.9 0 0 1 0-7.801ZM12 3.6a3.9 3.9 0 1 1 0 7.801A3.9 3.9 0 0 1 12 3.6Z"
    />
  </svg>
);
export default SvgAsana;
