import type { SVGProps } from "react";
import * as React from "react";
const SvgHome = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M4 12v9h16v-9h3L12 2 1 12h3Zm14 7v-7H6v7h12Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgHome;
