import type { SVGProps } from "react";
import * as React from "react";

const SvgHistory = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12.5 1.5v3H12a7.5 7.5 0 1 0 5.153 2.053L15 8.7V2h6.7l-2.424 2.43A10.47 10.47 0 0 1 22.5 12c0 5.799-4.701 10.5-10.5 10.5S1.5 17.799 1.5 12 6.201 1.5 12 1.5zm.75 9.982 3.134 3.134-1.768 1.768-3.866-3.866V7.5h2.5z"
    />
  </svg>
);
export default SvgHistory;
