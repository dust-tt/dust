import type { SVGProps } from "react";
import * as React from "react";

const SvgLinkedin = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Linkedin_svg__a)">
      <path
        fill="#0A66C2"
        d="M0 9.6c0-3.36 0-5.04.654-6.324A6 6 0 0 1 3.276.654C4.56 0 6.24 0 9.6 0h4.8c3.36 0 5.04 0 6.324.654a6 6 0 0 1 2.622 2.622C24 4.56 24 6.24 24 9.6v4.8c0 3.36 0 5.04-.654 6.324a6 6 0 0 1-2.622 2.622C19.44 24 17.76 24 14.4 24H9.6c-3.36 0-5.04 0-6.324-.654a6 6 0 0 1-2.622-2.622C0 19.44 0 17.76 0 14.4z"
      />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M19.928 19.928h-3.283v-5.591c0-1.533-.582-2.39-1.795-2.39-1.32 0-2.01.892-2.01 2.39v5.59H9.677V9.278h3.163v1.435s.951-1.76 3.211-1.76 3.877 1.38 3.877 4.233zM5.903 7.883c-1.078 0-1.95-.88-1.95-1.965 0-1.086.872-1.966 1.95-1.966s1.95.88 1.95 1.966a1.96 1.96 0 0 1-1.95 1.965M4.269 19.928h3.299V9.278H4.269z"
        clipRule="evenodd"
      />
    </g>
    <defs>
      <clipPath id="Linkedin_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgLinkedin;
