import type { SVGProps } from "react";
import * as React from "react";
const SvgRobot = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M3 13a6 6 0 0 1 6-6h6a6 6 0 0 1 6 6v3a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-3Zm10.665 2.33a.75.75 0 1 1 .67 1.34l-1.105.554a2.75 2.75 0 0 1-2.46 0l-1.105-.553a.75.75 0 1 1 .67-1.342l1.106.553a1.25 1.25 0 0 0 1.118 0l1.106-.553ZM18 13.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM7.5 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="M1 11a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1ZM22 12a1 1 0 1 1 2 0v3a1 1 0 1 1-2 0v-3Z"
    />
  </svg>
);
export default SvgRobot;
