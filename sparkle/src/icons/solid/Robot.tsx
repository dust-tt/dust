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
    <path fill="currentColor" d="M14 2a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M18 5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3h12Zm-9 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm7.5-1.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0ZM12 16c1.03 0 2 0 3-1v-1H9v1c1 1 1.97 1 3 1Z"
      clipRule="evenodd"
    />
    <path fill="currentColor" d="M2 10H0v6h2v-6ZM24 10h-2v6h2v-6Z" />
  </svg>
);
export default SvgRobot;
