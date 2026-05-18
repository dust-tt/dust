import type { SVGProps } from "react";
import * as React from "react";

const SvgFlipBackward = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.965 13.5a3.465 3.465 0 0 0-3.465-3.465H5.498l2.233 2.233a1.034 1.034 0 1 1-1.463 1.463l-4-4a1.034 1.034 0 0 1 0-1.462l4-4A1.034 1.034 0 1 1 7.731 5.73L5.498 7.965H16.5a5.535 5.535 0 0 1 0 11.07H12a1.035 1.035 0 0 1 0-2.07h4.5a3.465 3.465 0 0 0 3.465-3.465"
    />
  </svg>
);
export default SvgFlipBackward;
