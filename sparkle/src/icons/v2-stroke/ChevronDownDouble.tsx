import type { SVGProps } from "react";
import * as React from "react";

const SvgChevronDownDouble = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.269 12.269a1.034 1.034 0 1 1 1.463 1.462l-5 5a1.034 1.034 0 0 1-1.463 0l-5-5a1.034 1.034 0 1 1 1.462-1.463L12 16.539zm0-7a1.034 1.034 0 1 1 1.463 1.462l-5 5a1.034 1.034 0 0 1-1.463 0l-5-5A1.034 1.034 0 1 1 7.73 5.27L12 9.537z"
    />
  </svg>
);
export default SvgChevronDownDouble;
