import type { SVGProps } from "react";
import * as React from "react";
const SvgGrab = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8.5 4C7.675 4 7 4.675 7 5.5S7.675 7 8.5 7 10 6.325 10 5.5 9.325 4 8.5 4ZM16 4c-.825 0-1.5.675-1.5 1.5S15.175 7 16 7s1.5-.675 1.5-1.5S16.825 4 16 4ZM8.5 10.5c-.825 0-1.5.675-1.5 1.5s.675 1.5 1.5 1.5S10 12.825 10 12s-.675-1.5-1.5-1.5ZM16 10.5c-.825 0-1.5.675-1.5 1.5s.675 1.5 1.5 1.5 1.5-.675 1.5-1.5-.675-1.5-1.5-1.5ZM7 18.5c0-.825.675-1.5 1.5-1.5s1.5.675 1.5 1.5S9.325 20 8.5 20 7 19.325 7 18.5ZM14.5 18.5c0-.825.675-1.5 1.5-1.5s1.5.675 1.5 1.5S16.825 20 16 20s-1.5-.675-1.5-1.5Z"
    />
  </svg>
);
export default SvgGrab;
