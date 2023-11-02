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
    <path
      fill="currentColor"
      d="M14 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 11a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM12 16c1.03 0 2 0 3-1v-1H9v1c1 1 1.97 1 3 1Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M18 5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h12ZM6 7a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1H6Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M0 10h2v6H0v-6ZM22 10h2v6h-2v-6Z" />
  </svg>
);
export default SvgRobot;
