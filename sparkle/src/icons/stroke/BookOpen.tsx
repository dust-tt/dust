import type { SVGProps } from "react";
import * as React from "react";
const SvgBookOpen = (props: SVGProps<SVGSVGElement>) => (
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
      d="M13 20v2h-2v-2H2V4h7a3.99 3.99 0 0 1 3 1.354A3.99 3.99 0 0 1 15 4h7v16h-9Zm7-2V6h-5a2 2 0 0 0-2 2v10h7Zm-9 0V8a2 2 0 0 0-2-2H4v12h7Z"
    />
  </svg>
);
export default SvgBookOpen;
