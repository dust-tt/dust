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
      d="M4.929 19.071c-3.905-3.905-3.905-10.237 0-14.142 3.905-3.905 10.237-3.905 14.142 0 3.905 3.905 3.905 10.237 0 14.142-3.905 3.905-10.237 3.905-14.142 0Zm1.414-1.414A8 8 0 1 0 17.657 6.343 8 8 0 0 0 6.343 17.657ZM13 11h4v2h-4v4h-2v-4H7v-2h4V7h2v4Z"
    />
  </svg>
);
export default SvgPlusCircle;
