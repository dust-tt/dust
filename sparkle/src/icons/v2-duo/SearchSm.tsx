import type { SVGProps } from "react";
import * as React from "react";

const SvgSearchSm = (props: SVGProps<SVGSVGElement>) => (
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
      d="M14.269 14.269a1.034 1.034 0 0 1 1.462 0l6 6a1.034 1.034 0 1 1-1.464 1.462l-5.998-6a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M15.965 10a5.965 5.965 0 1 0-11.93 0 5.965 5.965 0 0 0 11.93 0m2.07 0a8.035 8.035 0 1 1-16.07 0 8.035 8.035 0 0 1 16.07 0"
    />
  </svg>
);
export default SvgSearchSm;
