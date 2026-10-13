import type { SVGProps } from "react";
import * as React from "react";

const SvgSo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#F0F0F0"
      d="m10 5.217 1.079 3.322h3.492l-2.825 2.053 1.079 3.321-2.826-2.053-2.825 2.053 1.08-3.321-2.826-2.053H8.92z"
    />
  </svg>
);
export default SvgSo;
