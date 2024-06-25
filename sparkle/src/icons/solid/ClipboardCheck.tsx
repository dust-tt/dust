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
      d="M16 16v5H3V7.992L8 8V3h13l-.003 13H16Zm2.997-2L19 5h-9v9h8.997Z"
    />
    <path
      fill="currentColor"
      d="M16.5 7 14 9.5 12.5 8 11 9.5l3 3 4-4L16.5 7Z"
    />
  </svg>
);
export default SvgClipboardCheck;
