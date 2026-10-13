import type { SVGProps } from "react";
import * as React from "react";

const SvgBr = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#6DA544"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path fill="#FFDA44" d="M10 3.913 18.261 10l-8.26 6.087L1.738 10z" />
    <path
      fill="#F0F0F0"
      d="M10 13.478a3.478 3.478 0 1 0 0-6.956 3.478 3.478 0 0 0 0 6.956"
    />
    <path
      fill="#0052B4"
      d="M8.26 9.783a5.9 5.9 0 0 0-1.738.262 3.478 3.478 0 0 0 6.326 1.95A5.86 5.86 0 0 0 8.26 9.783M13.414 10.666q.063-.323.064-.666a3.478 3.478 0 0 0-6.674-1.373 7.18 7.18 0 0 1 6.61 2.04"
    />
  </svg>
);
export default SvgBr;
