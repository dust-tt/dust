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
      d="m16.45 13.55-1.414-1.414-3.536 3.536-2.121-2.122-1.415 1.414L11.5 18.5l4.95-4.95Z"
    />
    <path
      fill="#111418"
      fillRule="evenodd"
      d="M9 3V1H7v2H2v18h20V3h-5V1h-2v2H9Zm-5 8h16v8H4v-8Zm0-6h3v2h2V5h6v2h2V5h3v4H4V5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCalendarCheck;
