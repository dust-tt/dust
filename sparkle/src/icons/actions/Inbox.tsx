import type { SVGProps } from "react";
import * as React from "react";
const SvgInbox = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 3v18H2V3h20ZM7.416 14H4v5h16v-5h-3.416a5.001 5.001 0 0 1-9.168 0ZM20 5H4v7h5a3 3 0 1 0 6 0h5V5Z"
    />
  </svg>
);
export default SvgInbox;
