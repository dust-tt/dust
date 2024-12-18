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
    <path fill="currentColor" d="M11 13v8H3v-8zm2-10h8v18h-8zM3 3h8v8H3z" />
  </svg>
);
export default SvgTemplate;
