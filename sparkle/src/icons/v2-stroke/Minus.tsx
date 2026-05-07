import type { SVGProps } from "react";
import * as React from "react";

const SvgMinus = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19 10.965a1.035 1.035 0 0 1 0 2.07H5a1.035 1.035 0 0 1 0-2.07z"
    />
  </svg>
);
export default SvgMinus;
