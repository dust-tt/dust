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
      d="M8 4h13v2H8V4Zm-5-.5h3v3H3v-3Zm0 7h3v3H3v-3Zm0 7h3v3H3v-3ZM8 11h13v2H8v-2Zm0 7h13v2H8v-2Z"
    />
  </svg>
);
export default SvgListCheck;
