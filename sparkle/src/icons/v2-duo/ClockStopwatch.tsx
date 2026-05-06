import type { SVGProps } from "react";
import * as React from "react";

const SvgClockStopwatch = (props: SVGProps<SVGSVGElement>) => (
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
      d="M4.44 3.36a1.034 1.034 0 1 1 1.463 1.464l-1.5 1.5A1.035 1.035 0 0 1 2.94 4.86zm13.657 0c.38-.379.98-.403 1.386-.07l.078.07 1.5 1.5a1.035 1.035 0 0 1-1.464 1.464l-1.5-1.5a1.035 1.035 0 0 1 0-1.464M10.965 5V3.035H10a1.035 1.035 0 0 1 0-2.07h4a1.035 1.035 0 0 1 0 2.07h-.964V5a1.035 1.035 0 0 1-2.07 0"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M19.465 13.5a7.465 7.465 0 1 0-14.93 0 7.465 7.465 0 0 0 14.93 0m-8.5-4a1.035 1.035 0 0 1 2.07 0v3.414l1.997 1.198a1.035 1.035 0 0 1-1.064 1.776l-2.5-1.5a1.04 1.04 0 0 1-.503-.888zm10.57 4a9.535 9.535 0 1 1-19.07 0 9.535 9.535 0 0 1 19.07 0"
    />
  </svg>
);
export default SvgClockStopwatch;
