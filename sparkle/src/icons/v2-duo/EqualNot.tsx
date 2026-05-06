import type { SVGProps } from "react";
import * as React from "react";

const SvgEqualNot = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19 13.965a1.035 1.035 0 0 1 0 2.07H5a1.035 1.035 0 0 1 0-2.07zm0-6a1.035 1.035 0 0 1 0 2.07H5a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M18.269 4.268a1.034 1.034 0 1 1 1.462 1.463l-14 14a1.034 1.034 0 1 1-1.463-1.463z"
    />
  </svg>
);
export default SvgEqualNot;
