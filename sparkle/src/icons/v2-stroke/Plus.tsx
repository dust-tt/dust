import type { SVGProps } from "react";
import * as React from "react";

const SvgPlus = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10.965 19v-5.965H5a1.035 1.035 0 0 1 0-2.07h5.965V5a1.035 1.035 0 0 1 2.07 0v5.965H19a1.035 1.035 0 0 1 0 2.07h-5.965V19a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgPlus;
