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
      d="M2 22h20V2H2v20Zm9-18v4H4V4h7ZM4 14v-4h7v4H4Zm0 2h7v4H4v-4Zm9 0h7v4h-7v-4Zm7-2h-7v-4h7v4Zm0-10v4h-7V4h7Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgTable;
