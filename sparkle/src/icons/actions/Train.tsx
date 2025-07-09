import type { SVGProps } from "react";
import * as React from "react";
const SvgTrain = (props: SVGProps<SVGSVGElement>) => (
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
      d="m17.2 20 1.8 1.5v.5H5v-.5L6.8 20H5a2 2 0 0 1-2-2V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v11a2 2 0 0 1-2 2h-1.8ZM7 5a2 2 0 0 0-2 2v11h14V7a2 2 0 0 0-2-2H7Zm5 12a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM6 7h12v4H6V7Z"
    />
  </svg>
);
export default SvgTrain;
