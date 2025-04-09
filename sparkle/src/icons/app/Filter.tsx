import type { SVGProps } from "react";
import * as React from "react";
const SvgFilter = (props: SVGProps<SVGSVGElement>) => (
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
      d="M3 4h18v3H3V4Zm3 6.5h12v3H6v-3ZM9 17h6v3H9v-3Z"
    />
  </svg>
);
export default SvgFilter;
