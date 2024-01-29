import type { SVGProps } from "react";
import * as React from "react";
const SvgClipboard = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 22v-3H5V7c-1.333 0-1.667.015-3-.008V22h15Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7 17c4.997 0 10 .076 14.997-.008L22 2H7v15ZM19.502 4.5l-.002 10h-10v-10h10.002Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgClipboard;
