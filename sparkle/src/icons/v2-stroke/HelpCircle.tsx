import type { SVGProps } from "react";
import * as React from "react";

const SvgHelpCircle = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#help-circle_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m-8.955 3.965a1.035 1.035 0 0 1 0 2.07H12a1.035 1.035 0 0 1 0-2.07zM9.876 6.517A4.036 4.036 0 0 1 15.956 10l-.014.284c-.129 1.391-1.186 2.32-1.948 2.827a8 8 0 0 1-1.577.809l-.116.044-.047.015-.004.002h-.003a1.034 1.034 0 0 1-.655-1.962l.015-.006.074-.027a6.035 6.035 0 0 0 1.165-.598c.687-.458 1.039-.937 1.039-1.388v-.002a1.964 1.964 0 0 0-3.819-.654 1.036 1.036 0 0 1-1.953-.688 4.04 4.04 0 0 1 1.763-2.14M23.036 12c0 6.095-4.942 11.035-11.036 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="help-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgHelpCircle;
