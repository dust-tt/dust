import type { SVGProps } from "react";
import * as React from "react";

const SvgAsterisk02 = (props: SVGProps<SVGSVGElement>) => (
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
      d="M17.269 5.269A1.034 1.034 0 1 1 18.73 6.73L13.463 12l5.268 5.269a1.034 1.034 0 1 1-1.463 1.463L12 13.462l-5.269 5.27a1.034 1.034 0 1 1-1.463-1.463L10.537 12 5.268 6.731A1.034 1.034 0 1 1 6.731 5.27L12 10.537z"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M10.965 20v-6.965H4a1.035 1.035 0 0 1 0-2.07h6.965V4a1.035 1.035 0 0 1 2.07 0v6.965H20a1.035 1.035 0 0 1 0 2.07h-6.965V20a1.035 1.035 0 0 1-2.07 0"
    />
  </svg>
);
export default SvgAsterisk02;
