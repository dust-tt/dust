import type { SVGProps } from "react";
import * as React from "react";

const SvgZoomIn = (props: SVGProps<SVGSVGElement>) => (
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
      d="M15.918 15.918a1.034 1.034 0 0 1 1.463 0l4.35 4.35a1.035 1.035 0 0 1-1.463 1.464l-4.35-4.35a1.034 1.034 0 0 1 0-1.464"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M17.965 11a6.965 6.965 0 1 0-13.93 0 6.965 6.965 0 0 0 13.93 0m-8 3v-1.965H8a1.035 1.035 0 0 1 0-2.07h1.965V8a1.035 1.035 0 0 1 2.07 0v1.965H14a1.035 1.035 0 0 1 0 2.07h-1.965V14a1.035 1.035 0 0 1-2.07 0m10.07-3a9.035 9.035 0 1 1-18.07 0 9.035 9.035 0 0 1 18.07 0"
    />
  </svg>
);
export default SvgZoomIn;
