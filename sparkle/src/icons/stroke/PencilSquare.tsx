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
      d="M6.414 15.89 16.556 5.748l-1.414-1.414L5 14.476v1.414h1.414Zm.829 2H3v-4.243L15 1.5l4.23 4.248L7.243 17.89ZM3 19.89h18v2H3v-2Z"
    />
  </svg>
);
export default SvgPencilSquare;
