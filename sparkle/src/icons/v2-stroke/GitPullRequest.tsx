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
      d="M7.965 6a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m12 12a1.965 1.965 0 1 0-3.93 0 1.965 1.965 0 0 0 3.93 0m2.07 0a4.035 4.035 0 1 1-5.07-3.901V8A.965.965 0 0 0 16 7.035h-3a1.035 1.035 0 0 1 0-2.07h3A3.036 3.036 0 0 1 19.035 8v6.099c1.727.457 3 2.03 3 3.901m-12-12a4.036 4.036 0 0 1-3 3.9V21a1.035 1.035 0 0 1-2.07 0V9.9a4.036 4.036 0 1 1 5.07-3.9"
    />
  </svg>
);
export default SvgGitPullRequest;
