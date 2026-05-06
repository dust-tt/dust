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
    <g fill="currentColor" clipPath="url(#pie-chart-01_svg__a)">
      <path
        d="M7.587 1.882a1.035 1.035 0 1 1 .827 1.896 8.966 8.966 0 1 0 11.843 11.71 1.036 1.036 0 0 1 1.907.805 11.038 11.038 0 0 1-17.922 3.55A11.036 11.036 0 0 1 7.587 1.882"
        opacity={0.4}
      />
      <path d="M12.035 1.048c.362-.109.717-.058.847-.048A11.035 11.035 0 0 1 23 11.12c.012.148.075.59-.105 1-.136.307-.38.573-.675.732a1.5 1.5 0 0 1-.6.172c-.141.012-.3.011-.42.011h-8.4c-.123 0-.277.002-.412-.01a1.6 1.6 0 0 1-.585-.156 1.54 1.54 0 0 1-.671-.671 1.5 1.5 0 0 1-.156-.584c-.012-.136-.011-.29-.011-.413V2.8c0-.12-.001-.28.012-.42.014-.158.05-.375.172-.6l.065-.108c.162-.246.398-.449.667-.567zm1 9.917h7.87a8.964 8.964 0 0 0-7.87-7.87z" />
    </g>
    <defs>
      <clipPath id="pie-chart-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgPieChart01;
