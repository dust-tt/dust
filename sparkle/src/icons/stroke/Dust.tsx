import type { SVGProps } from "react";
import * as React from "react";
const SvgDust = (props: SVGProps<SVGSVGElement>) => (
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
      d="M7 2a5 5 0 0 1 0 10h15v5h-5v5h-5v-5H7a2.5 2.5 0 0 1-.002-5H2V2h5Zm3 5a3 3 0 0 1-3 3H4V4h3a3 3 0 0 1 3 3Zm-3 7a.5.5 0 0 0 0 1h7v6h1v-6h5v-1H7Z"
      clipRule="evenodd"
    />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M7 17a2.5 2.5 0 0 1 0 5H2v-5h5Zm-3 2h3a.5.5 0 0 1 0 1H4v-1ZM17 12a5 5 0 0 0 5-5V2H12v5a5 5 0 0 0 5 5Zm-3-5a3 3 0 1 0 6 0V4h-6v3Z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgDust;
