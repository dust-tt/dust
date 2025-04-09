import type { SVGProps } from "react";
import * as React from "react";
const SvgHistory = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12h2a8 8 0 1 0 1.865-5.135L8 9H2V3l2.447 2.446A9.977 9.977 0 0 1 12 2Zm1 5v4.585l3.243 3.243-1.415 1.415L11 12.413V7h2Z"
    />
  </svg>
);
export default SvgHistory;
