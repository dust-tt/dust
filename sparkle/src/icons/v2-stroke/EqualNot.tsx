import type { SVGProps } from "react";
import * as React from "react";

const SvgEqualNot = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.269 4.269A1.034 1.034 0 1 1 19.73 5.73l-2.233 2.234H19a1.035 1.035 0 0 1 0 2.07h-3.572l-3.93 3.93H19a1.035 1.035 0 0 1 0 2.07H9.428L5.73 19.732a1.034 1.034 0 1 1-1.462-1.463l2.233-2.234H5a1.035 1.035 0 0 1 0-2.07h3.572l3.93-3.93H5a1.035 1.035 0 0 1 0-2.07h9.572z"
    />
  </svg>
);
export default SvgEqualNot;
