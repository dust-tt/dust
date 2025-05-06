import type { SVGProps } from "react";
import * as React from "react";
const SvgMagnifyingGlass = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.364 17.364A9 9 0 1 1 4.636 4.636a9 9 0 0 1 12.728 12.728Zm-2.121-2.121a6 6 0 1 1-8.486-8.485 6 6 0 0 1 8.486 8.485Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      d="m22.374 20.253-3.535-3.535-2.121 2.12 3.535 3.536 2.121-2.121Z"
    />
  </svg>
);
export default SvgMagnifyingGlass;
