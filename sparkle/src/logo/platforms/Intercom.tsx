import type { SVGProps } from "react";
import * as React from "react";

const SvgIntercom = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Intercom_svg__a)">
      <rect width={24} height={24} fill="#1F8DED" rx={6} />
      <path
        fill="#fff"
        d="M20.8 13.195a.8.8 0 0 1-1.6 0V6a.8.8 0 0 1 1.6 0zm-.28 5.008c-.123.105-3.086 2.592-8.52 2.592s-8.397-2.487-8.52-2.593a.8.8 0 0 1 1.039-1.216c.047.04 2.693 2.21 7.481 2.21 4.848 0 7.453-2.186 7.48-2.208a.8.8 0 0 1 1.04 1.215M3.2 6a.8.8 0 0 1 1.6 0v7.195a.8.8 0 0 1-1.6 0zm4-1.6a.8.8 0 0 1 1.6 0v10.688a.8.8 0 0 1-1.6 0zm4-.405a.8.8 0 0 1 1.6 0v11.6a.8.8 0 0 1-1.6 0zm4 .405a.8.8 0 0 1 1.6 0v10.688a.8.8 0 0 1-1.6 0z"
      />
    </g>
    <defs>
      <clipPath id="Intercom_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgIntercom;
