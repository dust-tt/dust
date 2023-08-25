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
      d="M7.243 17.996H3v-4.242L14.435 2.319a1 1 0 0 1 1.414 0l2.829 2.828a1 1 0 0 1 0 1.414L7.243 17.996Zm-4.243 2h18v2H3v-2Z"
    />
  </svg>
);
export default SvgPencilSquare;
