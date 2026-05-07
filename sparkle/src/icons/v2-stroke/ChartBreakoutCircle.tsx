import type { SVGProps } from "react";
import * as React from "react";

const SvgChartBreakoutCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#chart-breakout-circle_svg__a)">
      <path
        fill="currentColor"
        d="M14.965 12v-1.62a14 14 0 0 1-11.591 4.06 8.967 8.967 0 0 0 17.547-1.543 1.035 1.035 0 1 1 2.06.205c-.554 5.578-5.258 9.933-10.981 9.933C5.906 23.035.965 18.095.965 12c0-5.723 4.355-10.427 9.933-10.98a1.036 1.036 0 0 1 .204 2.06A8.967 8.967 0 0 0 3.035 12q.001.153.007.305.956.158 1.958.16c3.265 0 6.225-1.308 8.385-3.43H12a1.035 1.035 0 0 1 0-2.07h4c.572 0 1.035.463 1.035 1.035v4a1.035 1.035 0 0 1-2.07 0m7.046-4.535a1.035 1.035 0 0 1 0 2.07h-1.5a1.035 1.035 0 0 1 0-2.07zm-2.242-4.696A1.034 1.034 0 1 1 21.23 4.23l-1.06 1.062a1.036 1.036 0 0 1-1.464-1.464zm-5.304.731V2a1.035 1.035 0 0 1 2.07 0v1.5a1.035 1.035 0 0 1-2.07 0"
      />
    </g>
    <defs>
      <clipPath id="chart-breakout-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgChartBreakoutCircle;
