import type { SVGProps } from "react";
import * as React from "react";

const SvgGitPullRequest = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.965 21V9a1.035 1.035 0 0 1 2.07 0v12a1.035 1.035 0 0 1-2.07 0m12-6V8A.965.965 0 0 0 16 7.035h-3a1.035 1.035 0 0 1 0-2.07h3A3.036 3.036 0 0 1 19.035 8v7a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M19.965 18a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m-12-12a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m14.07 12a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0m-12-12a4.035 4.035 0 1 1-8.07 0 4.035 4.035 0 0 1 8.07 0"
    />
  </svg>
);
export default SvgGitPullRequest;
