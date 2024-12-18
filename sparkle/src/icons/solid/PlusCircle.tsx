import type { SVGProps } from "react";
import * as React from "react";
const SvgPlusCircle = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.929 19.071c-3.905-3.905-3.905-10.237 0-14.142s10.237-3.905 14.142 0 3.905 10.237 0 14.142-10.237 3.905-14.142 0M13 11V7h-2v4H7v2h4v4h2v-4h4v-2z"
    />
  </svg>
);
export default SvgPlusCircle;
