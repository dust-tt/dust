import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowUpOnSquare = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18 18a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-5H4v5a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-5h-2v5Z"
    />
    <path
      fill="currentColor"
      d="M11 6.828 8.636 9.192 7.222 7.778 12 3l4.778 4.778-1.414 1.414L13 6.828V15h-2V6.828Z"
    />
  </svg>
);
export default SvgArrowUpOnSquare;
