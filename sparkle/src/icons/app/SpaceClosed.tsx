import type { SVGProps } from "react";
import * as React from "react";
const SvgSpaceClosed = (props: SVGProps<SVGSVGElement>) => (
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
      d="M22 17.5 12 23 2 17.5v-9L12 14l10-5.5v9Zm0-11L12 12 2 6.5 12 1l10 5.5Z"
    />
  </svg>
);
export default SvgSpaceClosed;
