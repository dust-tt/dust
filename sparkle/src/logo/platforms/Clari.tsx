import type { SVGProps } from "react";
import * as React from "react";

const SvgClari = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Clari_svg__a)">
      <path
        fill="#00D7B8"
        d="m22.329 6.105-6.71 1.851c.287 1.267.431 2.631.431 4.044s-.144 2.777-.431 4.044l6.71 1.85C22.76 16.045 23 14.047 23 12s-.24-4.044-.671-5.895"
      />
      <path
        fill="#5F3AD7"
        d="M5.41 4.205 1 12l6.998-5.31C7.327 5.667 6.416 4.838 5.41 4.205m0 15.59L1 12l6.998 5.31c-.671 1.023-1.582 1.852-2.588 2.485"
      />
      <path
        fill="#0280FF"
        d="M13.462 2.5 1 12l14.667-4.044A16.7 16.7 0 0 0 13.462 2.5m0 19L1 12l14.667 4.044a16.7 16.7 0 0 1-2.205 5.456"
      />
      <path
        fill="#fff"
        d="M16.098 12c0-1.413-.144-2.777-.431-4.044L1 12l14.667 4.044c.287-1.267.431-2.631.431-4.044"
      />
    </g>
    <defs>
      <clipPath id="Clari_svg__a">
        <path fill="#fff" d="M1 2.5h22v19H1z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgClari;
