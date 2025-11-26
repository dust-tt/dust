import type { SVGProps } from "react";
import * as React from "react";
const SvgQuoteText = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 5H3v2h18V5Zm0 6H9v2h12v-2Zm0 6H9v2h12v-2ZM6 10H3v10h3V10Z"
    />
  </svg>
);
export default SvgQuoteText;
