import type { SVGProps } from "react";
import * as React from "react";

const SvgCodeCircle02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#code-circle-02_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M13.269 10.269a1.034 1.034 0 0 1 1.462 0l3 3a1.034 1.034 0 0 1 0 1.462l-3 3a1.034 1.034 0 1 1-1.463-1.463L15.538 14l-2.269-2.269a1.034 1.034 0 0 1 0-1.463m-4-4A1.034 1.034 0 1 1 10.73 7.73L8.463 10l2.268 2.268a1.034 1.034 0 1 1-1.463 1.463l-3-3a1.034 1.034 0 0 1 0-1.463z" />
    </g>
    <defs>
      <clipPath id="code-circle-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCodeCircle02;
