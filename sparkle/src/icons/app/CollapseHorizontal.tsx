import type { SVGProps } from "react";
import * as React from "react";

const SvgCollapseHorizontal = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#1C222D"
      d="M18.5 13.5 20 15l-2 2-5-5 5-5 2 2-1.5 1.5H23v3zM6 17l-2-2 1.5-1.5H1v-3h4.5L4 9l2-2 5 5z"
    />
  </svg>
);
export default SvgCollapseHorizontal;
