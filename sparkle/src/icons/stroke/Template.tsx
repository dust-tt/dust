import type { SVGProps } from "react";
import * as React from "react";
const SvgTemplate = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 3v18H3V3zM11 13H5v6h6zm2 6h6V5h-6zM11 5H5v6h6z"
    />
  </svg>
);
export default SvgTemplate;
