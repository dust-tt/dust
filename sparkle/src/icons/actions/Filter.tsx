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
    <path fill="currentColor" d="M3 5h18v2H3V5Zm3 6h12v2H6v-2Zm3 6h6v2H9v-2Z" />
  </svg>
);
export default SvgFilter;
