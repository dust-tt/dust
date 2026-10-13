import type { SVGProps } from "react";
import * as React from "react";

const SvgRw = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M0 10c0 1.732.44 3.362 1.216 4.783l8.784.87 8.784-.87A9.96 9.96 0 0 0 20 10l-10-.87z"
    />
    <path
      fill="#338AF3"
      d="M18.784 5.217A10 10 0 0 0 10 0 10 10 0 0 0 0 10h20c0-1.732-.44-3.362-1.216-4.783"
    />
    <path
      fill="#496E2D"
      d="M10 20a10 10 0 0 0 8.785-5.217H1.217A10 10 0 0 0 10 20"
    />
    <path
      fill="#FFDA44"
      d="m11.305 5.852 1.221.575-.65 1.183 1.326-.254.168 1.34.924-.986.923.986.168-1.34 1.327.254-.65-1.183 1.22-.575-1.22-.574.65-1.183-1.327.254-.168-1.34-.923.985-.924-.985-.168 1.34-1.326-.254.65 1.183z"
    />
  </svg>
);
export default SvgRw;
