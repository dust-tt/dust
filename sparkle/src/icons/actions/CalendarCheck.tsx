import type { SVGProps } from "react";
import * as React from "react";
const SvgCalendarCheck = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M9 1v2h6V1h2v2h4a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4V1h2Zm11 9H4v9h16v-9Zm-4.964 1.136 1.414 1.414-4.95 4.95-3.536-3.536L9.38 12.55l2.121 2.122 3.536-3.536ZM7 5H4v3h16V5h-3v1h-2V5H9v1H7V5Z"
    />
  </svg>
);
export default SvgCalendarCheck;
