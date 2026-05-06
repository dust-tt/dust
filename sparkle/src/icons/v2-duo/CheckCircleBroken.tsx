import type { SVGProps } from "react";
import * as React from "react";

const SvgCheckCircleBroken = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#check-circle-broken_svg__a)">
      <path
        d="M9.568 1.236a11.04 11.04 0 0 1 6.923.684 1.036 1.036 0 0 1-.843 1.891 8.964 8.964 0 1 0 5.317 8.195v-.92a1.035 1.035 0 0 1 2.07 0v.92l-.01.445a11.037 11.037 0 0 1-14.85 9.9A11.035 11.035 0 0 1 9.569 1.236"
        opacity={0.4}
      />
      <path d="M21.268 3.269a1.035 1.035 0 0 1 1.464 1.463l-10 10.01a1.036 1.036 0 0 1-1.463 0l-3-3a1.035 1.035 0 0 1 1.462-1.464L12 12.546z" />
    </g>
    <defs>
      <clipPath id="check-circle-broken_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgCheckCircleBroken;
