import type { SVGProps } from "react";
import * as React from "react";

const SvgMiro = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Miro_svg__a)">
      <path
        fill="#FD3"
        d="M0 9.6c0-3.36 0-5.04.654-6.324A6 6 0 0 1 3.276.654C4.56 0 6.24 0 9.6 0h4.8c3.36 0 5.04 0 6.324.654a6 6 0 0 1 2.622 2.622C24 4.56 24 6.24 24 9.6v4.8c0 3.36 0 5.04-.654 6.324a6 6 0 0 1-2.622 2.622C19.44 24 17.76 24 14.4 24H9.6c-3.36 0-5.04 0-6.324-.654a6 6 0 0 1-2.622-2.622C0 19.44 0 17.76 0 14.4z"
      />
      <path
        fill="#000"
        d="M15.928 4.427h-2.22l1.85 3.252-4.072-3.252h-2.22l2.036 3.975-4.257-3.975H4.824l2.22 5.06-2.22 10.116h2.22l4.258-10.84-2.036 10.84h2.22l4.072-11.562-1.85 11.562h2.22L20 6.956z"
      />
    </g>
    <defs>
      <clipPath id="Miro_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgMiro;
