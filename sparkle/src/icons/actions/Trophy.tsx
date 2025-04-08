import type { SVGProps } from "react";
import * as React from "react";
const SvgTrophy = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M13.005 16.94v2.063h5v2h-12v-2h5V16.94a8.001 8.001 0 0 1-7-7.938v-6h16v6a8.001 8.001 0 0 1-7 7.938Zm-7-11.937v4a6 6 0 1 0 12 0v-4h-12Zm-5 0h2v4h-2v-4Zm20 0h2v4h-2v-4Z"
    />
  </svg>
);
export default SvgTrophy;
