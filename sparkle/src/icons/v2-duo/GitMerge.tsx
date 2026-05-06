import type { SVGProps } from "react";
import * as React from "react";

const SvgGitMerge = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.965 21V9a1.035 1.035 0 0 1 2.07 0A7.964 7.964 0 0 0 15 16.965a1.035 1.035 0 0 1 0 2.07 10.04 10.04 0 0 1-7.096-2.94 10 10 0 0 1-.869-.995V21a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M19.965 18a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m-12-12a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m14.07 12a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0m-12-12a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0"
    />
  </svg>
);
export default SvgGitMerge;
