import type { SVGProps } from "react";
import * as React from "react";

const SvgGlobe02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#globe-02_svg__a)">
      <path
        d="M12 .965c.291 0 .569.122.765.337a16.34 16.34 0 0 1 4.27 10.72 16.34 16.34 0 0 1-4.27 10.676 1.036 1.036 0 0 1-1.53 0 16.34 16.34 0 0 1-4.27-10.72 16.34 16.34 0 0 1 4.27-10.676l.079-.076c.188-.167.432-.261.686-.261m0 2.645A14.26 14.26 0 0 0 9.035 12 14.26 14.26 0 0 0 12 20.389 14.26 14.26 0 0 0 14.964 12 14.26 14.26 0 0 0 12 3.61"
        opacity={0.4}
      />
      <path d="M20.965 12c0-.675-.077-1.332-.219-1.965H3.254A9 9 0 0 0 3.035 12c0 .675.077 1.332.219 1.965h17.492c.142-.633.219-1.29.219-1.965m-16.97 4.035a8.962 8.962 0 0 0 16.01 0zm8.005-13a8.96 8.96 0 0 0-8.005 4.93h16.01A8.96 8.96 0 0 0 12 3.035M23.035 12c0 6.095-4.94 11.035-11.035 11.035S.965 18.095.965 12 5.905.965 12 .965 23.035 5.905 23.035 12" />
    </g>
    <defs>
      <clipPath id="globe-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGlobe02;
