import type { SVGProps } from "react";
import * as React from "react";

const SvgMr = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#496E2D"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#FFDA44"
      d="M10 11.553A3.48 3.48 0 0 1 6.602 8.82q-.079.361-.08.745a3.478 3.478 0 1 0 6.875-.745A3.48 3.48 0 0 1 10 11.553"
    />
    <path
      fill="#FFDA44"
      d="m10 6.957.324.996h1.048l-.848.616.324.996L10 8.95l-.847.616.324-.996-.848-.616h1.048z"
    />
  </svg>
);
export default SvgMr;
