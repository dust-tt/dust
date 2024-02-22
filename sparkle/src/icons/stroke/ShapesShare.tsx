import type { SVGProps } from "react";
import * as React from "react";
const SvgShapesShare = (props: SVGProps<SVGSVGElement>) => (
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
      d="M11 5.828 8.636 8.192 7.222 6.778 12 2l4.778 4.778-1.414 1.414L13 5.828V12h-2V5.828Z"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M16 11h7v7h-7v-7Zm5 5h-3v-3h3v3ZM7 21l5-7.5 5 7.5H7Zm3.737-2h2.526L12 17.106 10.737 19ZM5 10.5a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm2 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgShapesShare;
