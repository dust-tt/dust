import type { SVGProps } from "react";
import * as React from "react";
const SvgCloudX = (props: SVGProps<SVGSVGElement>) => (
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
      d="m8.793 11.707 1.793 1.793-1.793 1.793 1.414 1.414L12 14.914l1.793 1.793 1.414-1.414-1.793-1.793 1.793-1.793-1.414-1.414L12 12.086l-1.793-1.793-1.414 1.414Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M16.5 21h-7a8.5 8.5 0 1 1 7.215-12.997A6.5 6.5 0 0 1 16.5 21Zm-7-15a6.5 6.5 0 0 0 0 13h7a4.5 4.5 0 1 0-.957-8.898A6.502 6.502 0 0 0 9.5 6Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgCloudX;
