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
      fillRule="evenodd"
      d="M8.5 3.5c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2Zm7.5 0c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2ZM8.5 10c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2Zm7.5 0c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2Zm-7.5 6.5c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2Zm7.5 0c-1.101 0-2 .899-2 2s.899 2 2 2 2-.899 2-2-.899-2-2-2Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgGrab;
