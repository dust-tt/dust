import type { SVGProps } from "react";
import * as React from "react";
const SvgSpaces = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17 5.75V11l5 2.75v5.5L17 22l-5-2.75L7 22l-5-2.75v-5.5L7 11V5.75L12 3l5 2.75ZM4.073 14.89 7 16.5l2.926-1.61L7 13.282l-2.927 1.61Zm10 0L17 16.5l2.926-1.61L17 13.282l-2.927 1.61Zm-5-8L12 8.5l2.926-1.61L12 5.282l-2.927 1.61Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgSpaces;
