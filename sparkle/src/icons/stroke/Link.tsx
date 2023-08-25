import type { SVGProps } from "react";
import * as React from "react";
const SvgLink = (props: SVGProps<SVGSVGElement>) => (
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
      d="m13.06 8.11 1.415 1.415a7 7 0 0 1 0 9.9l-.354.353a7 7 0 1 1-9.9-9.9l1.415 1.415a5 5 0 0 0 7.07 7.07l.354-.353a5 5 0 0 0 0-7.07l-1.414-1.415L13.06 8.11Zm6.718 6.011-1.414-1.414a5 5 0 0 0-7.071-7.071l-.354.353a5 5 0 0 0 0 7.071l1.414 1.415-1.414 1.414-1.414-1.414a7 7 0 0 1 0-9.9l.353-.353a7 7 0 0 1 9.9 9.9Z"
    />
  </svg>
);
export default SvgLink;
