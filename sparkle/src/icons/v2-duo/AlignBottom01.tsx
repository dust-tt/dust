import type { SVGProps } from "react";
import * as React from "react";

const SvgAlignBottom01 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 19.965a1.035 1.035 0 0 1 0 2.07H3a1.035 1.035 0 0 1 0-2.07z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M10.965 3a1.035 1.035 0 0 1 2.07 0v11.502l5.233-5.233a1.034 1.034 0 1 1 1.463 1.462l-7 7a1.035 1.035 0 0 1-1.463 0l-7-7A1.034 1.034 0 1 1 5.731 9.27l5.234 5.233z"
    />
  </svg>
);
export default SvgAlignBottom01;
