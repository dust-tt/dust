import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowDownOnSquare = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13 10h4l-5 5-5-5h4V3h2v7Zm-9 9h16v-7h2v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8h2v7Z"
    />
  </svg>
);
export default SvgArrowDownOnSquare;
