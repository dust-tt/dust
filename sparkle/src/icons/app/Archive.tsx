import type { SVGProps } from "react";
import * as React from "react";

const SvgArchive = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 21V7l-2-4H4L2 7.004V21zM5.236 5h13.528l1 2H4.237zM9 11h6v2H9z"
    />
  </svg>
);
export default SvgArchive;
