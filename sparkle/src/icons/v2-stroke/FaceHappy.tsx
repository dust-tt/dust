import type { SVGProps } from "react";
import * as React from "react";

const SvgFaceHappy = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#face-happy_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-4.465.965c.572 0 1.035.463 1.035 1.035 0 1.238-.724 2.38-1.691 3.175A6.1 6.1 0 0 1 12 18.535a6.1 6.1 0 0 1-3.844-1.36C7.19 16.38 6.465 15.238 6.465 14c0-.572.463-1.035 1.035-1.035zm-7.552 2.07c.137.181.307.365.52.54.637.523 1.533.89 2.532.89a4.02 4.02 0 0 0 2.531-.89c.213-.175.384-.359.52-.54zM9 7.465a1.535 1.535 0 1 1 0 3.07 1.535 1.535 0 0 1 0-3.07m6 0a1.535 1.535 0 1 1 0 3.07 1.535 1.535 0 0 1 0-3.07M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="face-happy_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgFaceHappy;
