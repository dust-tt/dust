import type { SVGProps } from "react";
import * as React from "react";

const SvgGitCommit = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 6.965a5.036 5.036 0 0 1 4.928 4H22a1.035 1.035 0 0 1 0 2.07h-5.072a5.036 5.036 0 0 1-9.856 0H2a1.035 1.035 0 0 1 0-2.07h5.072a5.036 5.036 0 0 1 4.928-4m0 2.07a2.965 2.965 0 1 0 0 5.93 2.965 2.965 0 0 0 0-5.93"
    />
  </svg>
);
export default SvgGitCommit;
