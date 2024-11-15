import type { SVGProps } from "react";
import * as React from "react";
const SvgServerLocked = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 17h-2v2h2v-2ZM12 7a1 1 0 0 0-1 1v1h2V8a1 1 0 0 0-1-1Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M21 5a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V5ZM5 17a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-2Zm5-9v1H9v4h6V9h-1V8a2 2 0 1 0-4 0Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgServerLocked;
