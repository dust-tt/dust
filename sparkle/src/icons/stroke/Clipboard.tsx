import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16 16v5H3V7.992L8 8V3h13l-.003 13H16Zm-2 0H8v-6H5v9h9v-3Zm4.997-2L19 5h-9v9h8.997Z"
    />
  </svg>
);
export default SvgClipboard;
