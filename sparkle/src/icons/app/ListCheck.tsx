import type { SVGProps } from "react";
import * as React from "react";

const SvgListCheck = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 5h13v2H8zm-5-.5h3v3H3zm0 6h3v3H3zm0 6h3v3H3zM8 11h13v2H8zm0 6h13v2H8z"
    />
  </svg>
);
export default SvgListCheck;
