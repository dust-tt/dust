import type { SVGProps } from "react";
import * as React from "react";
const SvgCloudArrowUp = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="m16 14-4-4-4 4h3v4h2v-4h3Z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M23 14.5a6.5 6.5 0 0 1-6.5 6.5h-7a8.5 8.5 0 1 1 7.215-12.997A6.5 6.5 0 0 1 23 14.5ZM9.5 6a6.5 6.5 0 0 0 0 13h7a4.5 4.5 0 1 0-.957-8.898A6.502 6.502 0 0 0 9.5 6Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCloudArrowUp;
