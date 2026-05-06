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
    <g fill="currentColor" clipPath="url(#help-circle_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M12.01 15.965a1.035 1.035 0 0 1 0 2.07H12a1.035 1.035 0 1 1 0-2.07zM9.875 6.517A4.036 4.036 0 0 1 15.955 10l-.013.285c-.13 1.39-1.186 2.318-1.948 2.826a8 8 0 0 1-1.694.852l-.034.013-.012.004h-.004l-.002.002L11.92 13l.327.982a1.035 1.035 0 0 1-.655-1.964l.015-.005.074-.027a6.02 6.02 0 0 0 1.165-.597c.687-.458 1.039-.938 1.039-1.389v-.002a1.965 1.965 0 0 0-3.818-.655 1.036 1.036 0 0 1-1.953-.686 4.04 4.04 0 0 1 1.761-2.14" />
    </g>
    <defs>
      <clipPath id="help-circle_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgHelpCircle;
