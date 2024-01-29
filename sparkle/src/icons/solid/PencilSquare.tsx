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
      d="M3 19.996h18v2H3v-2ZM3 17.89h4.243L19.23 5.748 15 1.5 3 13.647v4.243Z"
    />
  </svg>
);
export default SvgPencilSquare;
