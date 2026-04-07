import type { SVGProps } from "react";
import * as React from "react";

const SvgNetSuite = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0.2 150 150"
    {...props}
  >
    <path d="M0 .2h150v150H0z" fill="none" />
    <path
      d="M20.1 47.7h23.7V104h11.8v22H20.1zm109.7 51.8h-23.7V43.2H94.3v-22h35.5z"
      fill="#baccdb"
    />
    <path
      d="M14.6 15.8h74.9v64.3L60.7 43H14.6zm120.6 115.7H60.3V67.2l28.8 37.1h46.1"
      fill="#125580"
    />
  </svg>
);
export default SvgNetSuite;
