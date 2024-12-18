import type { SVGProps } from "react";
import * as React from "react";
const SvgListSelect = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 11.503h-9v2h9zM21 18.003h-9v2h9zM6 21.331l3.707-3.707-1.414-1.414L6 18.503 4.71 17.21l-1.42 1.41zM6 14.831l3.707-3.707L8.293 9.71 6 12.003 4.71 10.71l-1.42 1.41zM21 5.003h-9v2h9zM6 8.331l3.707-3.707L8.293 3.21 6 5.503 4.71 4.21 3.29 5.62z"
    />
  </svg>
);
export default SvgListSelect;
