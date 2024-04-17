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
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="m13.5 6.5 4 4 3-3-4-4-3 3ZM7 20.996 3 21v-4l9.5-9.5 4 4L7 20.996Zm6.671-9.496-7.5 7.497L5 18.998v-1.17l7.5-7.5 1.171 1.172Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M3 19h18v2H3v-2Z" />
  </svg>
);
export default SvgPencilSquare;
