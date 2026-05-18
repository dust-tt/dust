import type { SVGProps } from "react";
import * as React from "react";

const SvgSnowflake01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#snowflake-01_svg__a)">
      <path
        fill="currentColor"
        d="M14.268 1.268a1.035 1.035 0 0 1 1.464 1.463L13.035 5.43v4.778l4.138-2.39.987-3.683a1.036 1.036 0 0 1 2 .536l-.831 3.098 3.1.83a1.035 1.035 0 0 1-.537 2l-3.684-.988L14.07 12l4.138 2.389 3.684-.987a1.035 1.035 0 1 1 .537 2l-3.1.83.831 3.098a1.035 1.035 0 0 1-2 .536l-.987-3.684-4.138-2.39v4.78l2.697 2.697a1.035 1.035 0 0 1-1.464 1.462L12 20.463 9.732 22.73a1.035 1.035 0 0 1-1.464-1.463l2.697-2.696v-4.78l-4.139 2.39-.986 3.684a1.035 1.035 0 0 1-2-.536l.83-3.099-3.098-.83a1.035 1.035 0 0 1 .535-1.999l3.685.987 4.138-2.39L5.79 9.61l-3.682.988a1.036 1.036 0 1 1-.536-2l3.098-.83-.83-3.098a1.035 1.035 0 0 1 2-.536l.986 3.683 4.139 2.39v-4.78L8.268 2.732a1.034 1.034 0 1 1 1.464-1.463L12 3.536z"
      />
    </g>
    <defs>
      <clipPath id="snowflake-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSnowflake01;
