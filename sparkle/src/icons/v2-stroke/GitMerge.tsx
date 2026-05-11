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
      d="M19.965 18a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m-12-12a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m2.07 0a4.036 4.036 0 0 1-2.95 3.886 7.962 7.962 0 0 0 7.027 7.027A4.037 4.037 0 0 1 22.036 18a4.035 4.035 0 0 1-7.947.992 10.03 10.03 0 0 1-6.184-2.896 10 10 0 0 1-.869-.996V21a1.035 1.035 0 0 1-2.07 0V9.9a4.036 4.036 0 1 1 5.07-3.9"
    />
  </svg>
);
export default SvgGitMerge;
