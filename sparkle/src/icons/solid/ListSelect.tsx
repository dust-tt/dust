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
      d="M21 11H11v3h10v-3ZM21 17.5H11v3h10v-3ZM6 21.331l3.707-3.707-1.414-1.414L6 18.503 4.71 17.21l-1.42 1.41L6 21.331ZM6 14.831l3.707-3.707L8.293 9.71 6 12.003 4.71 10.71l-1.42 1.41L6 14.831ZM21 4.5H11v3h10v-3ZM6 8.331l3.707-3.707L8.293 3.21 6 5.503 4.71 4.21 3.29 5.62 6 8.331Z"
    />
  </svg>
);
export default SvgListSelect;
