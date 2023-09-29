import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboardCheck = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14 9.5 17.5 6 19 7.5l-5 5L10.5 9 12 7.5l2 2Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M8 17a1 1 0 0 1-1-1V3.008C7 2.45 7.449 2 8.007 2h12.986C21.549 2 22 2.449 22 3.007l-.003 12.985c0 .557-.449 1.008-1.008 1.008H8Zm11.5-2.5.002-10H9.5v10h10Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M17 18v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h3v10a1 1 0 0 0 1 1h10Z"
    />
  </svg>
);
export default SvgClipboardCheck;
