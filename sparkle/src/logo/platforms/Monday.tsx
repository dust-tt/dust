import type { SVGProps } from "react";
import * as React from "react";
const SvgMonday = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    preserveAspectRatio="xMidYMid"
    viewBox="0 -50 256 256"
    {...props}
  >
    <path
      fill="#F62B54"
      d="M31.846 153.489a31.97 31.97 0 0 1-27.86-16.167 30.911 30.911 0 0 1 .875-31.823l57.373-90.096A31.993 31.993 0 0 1 90.556.015a31.932 31.932 0 0 1 27.41 16.896c5.349 10.113 4.68 22.28-1.725 31.774L58.904 138.78a31.982 31.982 0 0 1-27.058 14.709Z"
    />
    <path
      fill="#FC0"
      d="M130.256 153.488c-11.572 0-22.22-6.187-27.812-16.13a30.814 30.814 0 0 1 .875-31.737l57.264-89.89A31.944 31.944 0 0 1 188.93.016c11.669.255 22.244 6.782 27.592 16.993a30.813 30.813 0 0 1-2.066 31.92l-57.252 89.889a31.933 31.933 0 0 1-26.948 14.671Z"
    />
    <ellipse cx={226.466} cy={125.324} fill="#00CA72" rx={29.538} ry={28.918} />
  </svg>
);
export default SvgMonday;
