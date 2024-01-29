import type { SVGProps } from "react";
import * as React from "react";
const SvgExternalLink = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M10 8H5v11h11v-5h2v7H3V6h7v2Z" />
    <path
      fill="currentColor"
      d="M21 11h-2V6.413l-7.793 7.794-1.414-1.414L17.585 5H13V3h8v8Z"
    />
  </svg>
);
export default SvgExternalLink;
