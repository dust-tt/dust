import type { SVGProps } from "react";
import * as React from "react";

const SvgFaceNeutral = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#face-neutral_svg__a)">
      <path
        fill="currentColor"
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12M16 13.965a1.035 1.035 0 0 1 0 2.07H8a1.035 1.035 0 0 1 0-2.07zm-7-6.5a1.535 1.535 0 1 1 0 3.07 1.535 1.535 0 0 1 0-3.07m6 0a1.535 1.535 0 1 1 0 3.07 1.535 1.535 0 0 1 0-3.07M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
      />
    </g>
    <defs>
      <clipPath id="face-neutral_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgFaceNeutral;
