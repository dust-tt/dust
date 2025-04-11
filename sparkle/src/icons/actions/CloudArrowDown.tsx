import type { SVGProps } from "react";
import * as React from "react";
const SvgCloudArrowDown = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m16 13-4 4-4-4h3V9h2v4h3Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M9.5 21h7a6.5 6.5 0 0 0 .215-12.997A8.5 8.5 0 1 0 9.5 21ZM3 12.5a6.5 6.5 0 0 1 12.543-2.398A4.5 4.5 0 1 1 16.5 19h-7A6.5 6.5 0 0 1 3 12.5Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCloudArrowDown;
