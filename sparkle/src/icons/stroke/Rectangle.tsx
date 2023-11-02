import type { SVGProps } from "react";
import * as React from "react";
const SvgRectangle = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15 4H9v16h6V4ZM7 2v20h10V2H7Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgRectangle;
