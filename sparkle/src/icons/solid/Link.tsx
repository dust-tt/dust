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
      fillRule="evenodd"
      d="m13.06 7.404 1.768 1.767a7.5 7.5 0 0 1 0 10.607l-.353.354A7.5 7.5 0 0 1 3.868 9.525l.354-.354 2.121 2.122-.354.353a4.5 4.5 0 1 0 6.364 6.364l.354-.353a4.5 4.5 0 0 0 0-6.364l-1.768-1.768 2.121-2.121Zm6.718 7.424-2.121-2.121.353-.354a4.5 4.5 0 1 0-6.364-6.364l-.353.354a4.5 4.5 0 0 0 0 6.364l1.768 1.768-2.122 2.121-1.768-1.768a7.5 7.5 0 0 1 0-10.606l.354-.354A7.5 7.5 0 0 1 20.13 14.475l-.353.353Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLink;
