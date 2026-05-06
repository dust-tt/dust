import type { SVGProps } from "react";
import * as React from "react";

const SvgGlobe01 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#globe-01_svg__a)">
      <path
        d="M12 .965c.291 0 .569.122.765.337a16.34 16.34 0 0 1 4.27 10.72 16.34 16.34 0 0 1-4.27 10.676 1.036 1.036 0 0 1-1.53 0 16.34 16.34 0 0 1-4.27-10.72 16.34 16.34 0 0 1 4.27-10.676l.079-.076c.188-.167.432-.261.686-.261m0 2.645A14.26 14.26 0 0 0 9.035 12 14.26 14.26 0 0 0 12 20.389 14.26 14.26 0 0 0 14.964 12 14.26 14.26 0 0 0 12 3.61"
        opacity={0.4}
      />
      <path d="M12 .965c6.095 0 11.035 4.94 11.035 11.035S18.095 23.035 12 23.035.965 18.095.965 12 5.905.965 12 .965m-8.903 12.07c.513 4.464 4.302 7.93 8.903 7.93s8.39-3.466 8.903-7.93zm8.903-10c-4.601 0-8.39 3.466-8.903 7.93h17.806C20.39 6.5 16.601 3.035 12 3.035" />
    </g>
    <defs>
      <clipPath id="globe-01_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGlobe01;
