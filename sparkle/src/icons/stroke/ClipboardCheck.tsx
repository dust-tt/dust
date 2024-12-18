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
      d="M16 16v5H3V7.993L8 8V3h13l-.003 13zm-2 0H8v-6H5v9h9zm4.997-2L19 5h-9v9z"
    />
    <path fill="currentColor" d="M16.5 7 14 9.5 12.5 8 11 9.5l3 3 4-4z" />
  </svg>
);
export default SvgClipboardCheck;
