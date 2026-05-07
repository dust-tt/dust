import type { SVGProps } from "react";
import * as React from "react";

const SvgCodeCircle01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#code-circle-01_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12M8.769 8.269A1.034 1.034 0 1 1 10.23 9.73L7.963 12l2.268 2.269A1.034 1.034 0 1 1 8.77 15.73l-3-3a1.034 1.034 0 0 1 0-1.462zm5 0a1.034 1.034 0 0 1 1.462 0l3 3a1.034 1.034 0 0 1 0 1.462l-3 3a1.034 1.034 0 1 1-1.462-1.462L16.037 12 13.77 9.731a1.034 1.034 0 0 1 0-1.462M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="code-circle-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCodeCircle01;
