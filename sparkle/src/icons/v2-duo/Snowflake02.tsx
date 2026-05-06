import type { SVGProps } from "react";
import * as React from "react";

const SvgSnowflake02 = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g fill="currentColor" clipPath="url(#snowflake-02_svg__a)">
      <path
        d="M10.965 16v-2.965H8a1.035 1.035 0 0 1 0-2.07h2.965V8a1.035 1.035 0 0 1 2.07 0v2.965H16a1.035 1.035 0 0 1 0 2.07h-2.965V16a1.035 1.035 0 0 1-2.07 0"
        opacity={0.4}
      />
      <path d="M10.965 22v-3.502L7.73 21.731A1.034 1.034 0 1 1 6.27 20.27l5-5 .078-.072a1.034 1.034 0 0 1 1.384.072l5 5a1.034 1.034 0 1 1-1.462 1.462l-3.234-3.233V22a1.035 1.035 0 0 1-2.07 0M2.269 6.269a1.034 1.034 0 0 1 1.462 0l5 5a1.034 1.034 0 0 1 0 1.462l-5 5A1.034 1.034 0 1 1 2.27 16.27l3.233-3.234H2a1.035 1.035 0 0 1 0-2.07h3.502L2.269 7.73a1.034 1.034 0 0 1 0-1.462m18 0A1.034 1.034 0 1 1 21.73 7.73l-3.233 3.234H22a1.035 1.035 0 0 1 0 2.07h-3.502l3.233 3.234a1.034 1.034 0 1 1-1.462 1.462l-5-5a1.034 1.034 0 0 1 0-1.462zm-4-4A1.034 1.034 0 1 1 17.73 3.73l-5 5a1.034 1.034 0 0 1-1.462 0l-5-5A1.034 1.034 0 1 1 7.73 2.27l3.234 3.233V2a1.035 1.035 0 0 1 2.07 0v3.502z" />
    </g>
    <defs>
      <clipPath id="snowflake-02_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgSnowflake02;
