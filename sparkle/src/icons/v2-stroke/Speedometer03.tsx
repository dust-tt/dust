import type { SVGProps } from "react";
import * as React from "react";

const SvgSpeedometer03 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0m-5.207-5.207a1 1 0 1 1 1.414 1.414l-3.277 3.276q.068.248.07.517a2 2 0 1 1-1.484-1.93zM4 12a8 8 0 0 1 8-8 1 1 0 1 1 0 2 6 6 0 0 0-6 6 1 1 0 1 1-2 0m19 0c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11"
    />
  </svg>
);
export default SvgSpeedometer03;
