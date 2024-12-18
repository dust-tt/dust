import type { SVGProps } from "react";
import * as React from "react";
const SvgTable = (props: SVGProps<SVGSVGElement>) => (
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
      fillRule="evenodd"
      d="M2 22h20V2H2zm9-18v4H4V4zM4 14v-4h7v4zm0 2h7v4H4zm9 0h7v4h-7zm7-2h-7v-4h7zm0-10v4h-7V4z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTable;
