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
      d="M21 3v18H3V3h18ZM11 13H5v6h6v-6Zm2 6h6V5h-6v14ZM11 5H5v6h6V5Z"
    />
  </svg>
);
export default SvgTemplate;
