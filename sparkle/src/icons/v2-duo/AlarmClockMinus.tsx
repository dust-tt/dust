import type { SVGProps } from "react";
import * as React from "react";

const SvgAlarmClockMinus = (props: SVGProps<SVGSVGElement>) => (
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
      d="M5.268 18.269a1.034 1.034 0 1 1 1.463 1.462l-2 2a1.034 1.034 0 1 1-1.463-1.463zm12 0a1.034 1.034 0 0 1 1.463 0l2 2a1.034 1.034 0 1 1-1.463 1.462l-2-2a1.034 1.034 0 0 1 0-1.463m-13-16A1.034 1.034 0 1 1 5.731 3.73l-3 3a1.034 1.034 0 1 1-1.463-1.463zm14 0a1.034 1.034 0 0 1 1.463 0l3 3a1.034 1.034 0 1 1-1.463 1.462l-3-3a1.034 1.034 0 0 1 0-1.463"
      opacity={0.4}
    />
    <path
      fill="currentColor"
      d="M18.965 13a6.965 6.965 0 1 0-13.93 0 6.965 6.965 0 0 0 13.93 0M15 11.965a1.035 1.035 0 0 1 0 2.07H9a1.035 1.035 0 0 1 0-2.07zM21.035 13a9.035 9.035 0 1 1-18.07 0 9.035 9.035 0 0 1 18.07 0"
    />
  </svg>
);
export default SvgAlarmClockMinus;
