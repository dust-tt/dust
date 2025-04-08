import type { SVGProps } from "react";
import * as React from "react";
const SvgPencilSquare = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M3 18.996h18v2H3v-2Z" />
    <path
      fill="currentColor"
      d="m3 19 4 1.996 9.5-9.496-4-4L3 17v2ZM16.5 3.5l4 4-3 3-4-4 3-3Z"
    />
  </svg>
);
export default SvgPencilSquare;
