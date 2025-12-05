import type { SVGProps } from "react";
import * as React from "react";
const SvgAshby = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={20} height={20} x={2} y={2} fill="#473BCE" rx={4} />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M8.885 18.47V19H4.5v-.53c1.136 0 1.59-.254 2-1.361L10.77 5h2.023l4.703 12.109c.454 1.13.682 1.36 1.659 1.36V19H12.26v-.53c1.636 0 1.774-.15 1.283-1.361l-1.25-3.322H8.499L7.386 17.04c-.325 1.1-.254 1.43 1.5 1.43Zm1.41-9.941-1.546 4.543h3.272L10.294 8.53Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgAshby;
