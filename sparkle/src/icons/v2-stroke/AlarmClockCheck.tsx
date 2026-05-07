import type { SVGProps } from "react";
import * as React from "react";

const SvgAlarmClockCheck = (props: SVGProps<SVGSVGElement>) => (
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
      d="M18.965 13a6.965 6.965 0 1 0-13.93 0 6.965 6.965 0 0 0 13.93 0m-4.196-2.732a1.034 1.034 0 1 1 1.463 1.463l-4.5 4.5a1.034 1.034 0 0 1-1.463 0l-2-2a1.034 1.034 0 1 1 1.462-1.463L11 14.038zm-10.5-8A1.034 1.034 0 1 1 5.73 3.731l-3 3A1.034 1.034 0 1 1 1.27 5.268zm14 0a1.034 1.034 0 0 1 1.463 0l3 3a1.034 1.034 0 1 1-1.463 1.463l-3-3a1.034 1.034 0 0 1 0-1.463M21.035 13a9.03 9.03 0 0 1-1.959 5.613l1.656 1.656a1.034 1.034 0 1 1-1.463 1.462l-1.656-1.655A9.03 9.03 0 0 1 12 22.036a9.03 9.03 0 0 1-5.614-1.96L4.73 21.731a1.034 1.034 0 1 1-1.462-1.463l1.654-1.655A9.033 9.033 0 0 1 18.389 6.611 9.04 9.04 0 0 1 21.035 13"
    />
  </svg>
);
export default SvgAlarmClockCheck;
