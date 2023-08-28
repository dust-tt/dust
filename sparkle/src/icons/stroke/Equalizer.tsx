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
      d="M8 2H6v3.126a4.002 4.002 0 0 0 0 7.748V22h2v-9.126a4.002 4.002 0 0 0 0-7.748V2Zm1 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM18 2h-2v9.126a4.002 4.002 0 0 0 0 7.748V22h2v-3.126a4.002 4.002 0 0 0 0-7.748V2Zm-1 15a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgEqualizer;
