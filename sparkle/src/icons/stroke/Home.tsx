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
      d="M4 12v9h16v-9h3L12 2 1 12zm14 0v7H6v-7zm-.173-2L12 4.703 6.173 10z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgHome;
