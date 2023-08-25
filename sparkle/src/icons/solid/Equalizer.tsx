import type { SVGProps } from "react";
import * as React from "react";
const SvgEqualizer = (props: SVGProps<SVGSVGElement>) => (
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
      d="M8 2H6v3.126a4.002 4.002 0 0 0 0 7.748V22h2v-9.126a4.002 4.002 0 0 0 0-7.748V2Zm0 7a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM18 2h-2v9.126a4.002 4.002 0 0 0 0 7.748V22h2v-3.126a4.002 4.002 0 0 0 0-7.748V2Zm-1 14a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgEqualizer;
