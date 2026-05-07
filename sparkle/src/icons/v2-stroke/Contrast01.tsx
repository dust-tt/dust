import type { SVGProps } from "react";
import * as React from "react";

const SvgContrast01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#contrast-01_svg__a)">
      <path
        fill="currentColor"
        d="M12 .965q.979.001 1.913.166a1.034 1.034 0 1 1-.356 2.039 9 9 0 0 0-.522-.074v17.807a9 9 0 0 0 .52-.072 1.035 1.035 0 1 1 .356 2.04q-.933.163-1.911.164C5.906 23.035.965 18.095.965 12S5.905.965 12 .965m7.342 16.18a1.036 1.036 0 0 1 1.694 1.19 11.1 11.1 0 0 1-2.705 2.704 1.035 1.035 0 0 1-1.188-1.694 9 9 0 0 0 2.199-2.2M20.965 12a9 9 0 0 0-.134-1.556 1.035 1.035 0 1 1 2.04-.357 11.1 11.1 0 0 1 0 3.826 1.035 1.035 0 0 1-2.04-.357A9 9 0 0 0 20.965 12M16.89 3.215a1.036 1.036 0 0 1 1.442-.253 11.1 11.1 0 0 1 2.708 2.709 1.036 1.036 0 0 1-1.695 1.188 9 9 0 0 0-2.202-2.203 1.035 1.035 0 0 1-.253-1.441M3.035 12c0 4.601 3.466 8.39 7.93 8.903V3.096C6.5 3.609 3.035 7.399 3.035 12"
      />
    </g>
    <defs>
      <clipPath id="contrast-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgContrast01;
