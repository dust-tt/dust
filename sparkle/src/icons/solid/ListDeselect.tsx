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
      d="M7.293 8.707 6 7.414 4.707 8.707 3.293 7.293 4.586 6 3.293 4.707l1.414-1.414L6 4.586l1.293-1.293 1.414 1.414L7.414 6l1.293 1.293zM11 4.5h10v3H11zM21 11H11v3h10zM21 17.5H11v3h10zM6 20.414l1.293 1.293 1.414-1.414L7.414 19l1.293-1.293-1.414-1.414L6 17.586l-1.293-1.293-1.414 1.414L4.586 19l-1.293 1.293 1.414 1.414zM7.293 15.207 6 13.914l-1.293 1.293-1.414-1.414L4.586 12.5l-1.293-1.293 1.414-1.414L6 11.086l1.293-1.293 1.414 1.414L7.414 12.5l1.293 1.293z"
    />
  </svg>
);
export default SvgListDeselect;
