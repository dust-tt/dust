import type { SVGProps } from "react";
import * as React from "react";

const SvgPieChart01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#pie-chart-01_svg__a)">
      <path
        fill="currentColor"
        d="M7.587 1.881a1.035 1.035 0 0 1 .827 1.898 8.966 8.966 0 1 0 9.245 15.17 8.96 8.96 0 0 0 2.598-3.462 1.035 1.035 0 0 1 1.907.806A11.036 11.036 0 1 1 7.587 1.881m4.45-.833c.36-.108.715-.058.845-.048a11.04 11.04 0 0 1 6.922 3.197A11.04 11.04 0 0 1 23 11.118c.012.15.076.591-.104 1.002a1.56 1.56 0 0 1-.675.731 1.5 1.5 0 0 1-.6.172c-.141.013-.3.011-.42.011h-8.4c-.123 0-.278.002-.413-.01a1.55 1.55 0 0 1-.584-.156 1.54 1.54 0 0 1-.671-.671 1.5 1.5 0 0 1-.157-.584c-.011-.136-.01-.29-.01-.413V2.8c0-.12-.001-.28.012-.42.014-.158.05-.375.172-.6l.065-.108c.162-.246.397-.449.666-.567zm.998 9.917h7.87a8.97 8.97 0 0 0-2.565-5.304 8.97 8.97 0 0 0-5.305-2.567z"
      />
    </g>
    <defs>
      <clipPath id="pie-chart-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgPieChart01;
