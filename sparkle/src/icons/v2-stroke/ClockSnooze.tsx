import type { SVGProps } from "react";
import * as React from "react";

const SvgClockSnooze = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#clock-snooze_svg__a)">
      <path
        fill="currentColor"
        d="M21.5 15.965a1.035 1.035 0 0 1 .731 1.766l-3.233 3.234H21.5a1.035 1.035 0 0 1 0 2.07h-5a1.035 1.035 0 0 1-.731-1.766l3.233-3.234H16.5a1.035 1.035 0 0 1 0-2.07zM10.965 6a1.035 1.035 0 0 1 2.07 0v5.36l3.166 1.583a1.035 1.035 0 0 1-.926 1.852l-3.738-1.87a1.03 1.03 0 0 1-.572-.925zm10 6a8.965 8.965 0 1 0-17.93 0 8.965 8.965 0 0 0 9.863 8.92 1.036 1.036 0 0 1 .204 2.06 11 11 0 0 1-1.102.055C5.906 23.035.965 18.095.965 12S5.905.965 12 .965 23.035 5.905 23.035 12q0 .558-.055 1.102a1.035 1.035 0 1 1-2.06-.204q.045-.443.045-.898"
      />
    </g>
    <defs>
      <clipPath id="clock-snooze_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgClockSnooze;
