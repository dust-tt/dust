import type { SVGProps } from "react";
import * as React from "react";

const SvgSearchLg = (props: SVGProps<SVGSVGElement>) => (
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
      d="M16.769 16.769a1.034 1.034 0 0 1 1.462 0l3.5 3.5a1.034 1.034 0 1 1-1.464 1.462l-3.498-3.5a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M18.965 11.5a7.465 7.465 0 1 0-14.93 0 7.465 7.465 0 0 0 14.93 0m2.07 0a9.535 9.535 0 1 1-19.07 0 9.535 9.535 0 0 1 19.07 0"
    />
  </svg>
);
export default SvgSearchLg;
