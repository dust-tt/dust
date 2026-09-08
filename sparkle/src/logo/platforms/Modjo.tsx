import type { SVGProps } from "react";
import * as React from "react";

const SvgModjo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Modjo_svg__a)">
      <path
        fill="#111827"
        d="M24 12c0-6.627-5.373-12-12-12S0 5.373 0 12s5.373 12 12 12 12-5.373 12-12"
      />
      <path
        fill="#fff"
        d="M7.2 10.56a.96.96 0 1 0-1.92 0v3.6a.96.96 0 1 0 1.92 0zM10.08 5.28a.96.96 0 1 0-1.92 0v13.44a.96.96 0 1 0 1.92 0zM12.96 8.16a.96.96 0 1 0-1.92 0v8.88a.96.96 0 1 0 1.92 0zM15.84 5.28a.96.96 0 1 0-1.92 0v13.44a.96.96 0 1 0 1.92 0zM18.72 10.56a.96.96 0 1 0-1.92 0v3.6a.96.96 0 1 0 1.92 0z"
      />
    </g>
    <defs>
      <clipPath id="Modjo_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgModjo;
