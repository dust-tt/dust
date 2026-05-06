import type { SVGProps } from "react";
import * as React from "react";

const SvgLoading02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#loading-02_svg__a)">
      <path
        d="M7.018 15.519a1.035 1.035 0 0 1 1.464 1.462l-2.829 2.83a1.035 1.035 0 1 1-1.463-1.464zm8.5 0a1.035 1.035 0 0 1 1.464 0l2.829 2.828a1.035 1.035 0 0 1-1.464 1.463l-2.829-2.829a1.034 1.034 0 0 1 0-1.463M4.19 4.268a1.034 1.034 0 0 1 1.463 0l2.83 2.828A1.035 1.035 0 0 1 7.017 8.56L4.19 5.731a1.034 1.034 0 0 1 0-1.463m14.157 0A1.035 1.035 0 0 1 19.81 5.73l-2.828 2.83a1.035 1.035 0 0 1-1.463-1.464z"
        opacity={0.4}
      />
      <path d="M10.965 22v-4a1.035 1.035 0 0 1 2.07 0v4a1.035 1.035 0 0 1-2.07 0M6 10.965a1.035 1.035 0 0 1 0 2.07H2a1.035 1.035 0 0 1 0-2.07zm16 0a1.035 1.035 0 0 1 0 2.07h-4a1.035 1.035 0 0 1 0-2.07zM10.965 6V2a1.035 1.035 0 0 1 2.07 0v4a1.035 1.035 0 0 1-2.07 0" />
    </g>
    <defs>
      <clipPath id="loading-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgLoading02;
