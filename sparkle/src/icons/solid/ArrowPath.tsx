import type { SVGProps } from "react";
import * as React from "react";
const SvgArrowPath = (props: SVGProps<SVGSVGElement>) => (
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
      d="M12 4.5A7.5 7.5 0 0 0 4.5 12h-3C1.5 6.201 6.201 1.5 12 1.5c2.9 0 5.524 1.175 7.425 3.075L22 2v7h-7l2.303-2.303A7.476 7.476 0 0 0 12 4.5ZM6.697 17.303 9 15H2v7l2.575-2.575c1.9 1.9 4.526 3.075 7.425 3.075 5.799 0 10.5-4.701 10.5-10.5h-3a7.5 7.5 0 0 1-12.803 5.303Z"
    />
  </svg>
);
export default SvgArrowPath;
