import type { SVGProps } from "react";
import * as React from "react";
const SvgListDeselect = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7.293 8.707 6 7.414 4.707 8.707 3.293 7.293 4.586 6 3.293 4.707l1.414-1.414L6 4.586l1.293-1.293 1.414 1.414L7.414 6l1.293 1.293-1.414 1.414ZM11 5.003h10v2H11v-2ZM21 11.503H11v2h10v-2ZM21 18.003H11v2h10v-2ZM6 20.414l1.293 1.293 1.414-1.414L7.414 19l1.293-1.293-1.414-1.414L6 17.586l-1.293-1.293-1.414 1.414L4.586 19l-1.293 1.293 1.414 1.414L6 20.414ZM7.293 15.207 6 13.914l-1.293 1.293-1.414-1.414L4.586 12.5l-1.293-1.293 1.414-1.414L6 11.086l1.293-1.293 1.414 1.414L7.414 12.5l1.293 1.293-1.414 1.414Z"
    />
  </svg>
);
export default SvgListDeselect;
