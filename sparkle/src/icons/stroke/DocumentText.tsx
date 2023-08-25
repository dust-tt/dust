import * as React from "react";
import type { SVGProps } from "react";
const SvgDocumentText = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 8v12.993A1 1 0 0 1 20.007 22H3.993A.993.993 0 0 1 3 21.008V2.992C3 2.455 3.449 2 4.002 2h10.995L21 8Zm-2 1h-5V4H5v16h14V9ZM8 7h3v2H8V7Zm0 4h8v2H8v-2Zm0 4h8v2H8v-2Z"
    />
  </svg>
);
export default SvgDocumentText;
