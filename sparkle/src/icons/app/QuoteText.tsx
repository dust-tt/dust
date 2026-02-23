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
      d="M21 5H3v2h18zm0 6H9v2h12zm0 6H9v2h12zM6 10H3v10h3z"
    />
  </svg>
);
export default SvgQuoteText;
