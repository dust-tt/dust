import type { SVGProps } from "react";
import * as React from "react";

const SvgContrast03 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#contrast-03_svg__a)">
      <path
        d="M20.965 12a8.965 8.965 0 1 0-17.93 0A8.965 8.965 0 0 0 12 20.965 8.965 8.965 0 0 0 20.965 12m2.07 0c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12"
        opacity={0.4}
      />
      <path d="M17.465 12c0-.826-.185-1.61-.514-2.313a8.536 8.536 0 0 1-7.264 7.264A5.465 5.465 0 0 0 17.465 12m2.07 0a7.534 7.534 0 0 1-13.66 4.39 1.035 1.035 0 0 1 1.087-1.61 6.465 6.465 0 0 0 7.82-7.82 1.035 1.035 0 0 1 1.608-1.084A7.53 7.53 0 0 1 19.535 12" />
    </g>
    <defs>
      <clipPath id="contrast-03_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgContrast03;
