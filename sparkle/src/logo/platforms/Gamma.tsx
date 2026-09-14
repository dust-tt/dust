import type { SVGProps } from "react";
import * as React from "react";

const SvgGamma = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Gamma_svg__a)">
      <rect width={24} height={24} fill="#F7F7F7" rx={6} />
      <path
        fill="#002253"
        d="M7.99 5.016a8 8 0 0 0-2.93 2.862 7.54 7.54 0 0 0-1.091 3.945 7.6 7.6 0 0 0 1.082 3.944 8 8 0 0 0 2.93 2.863c1.227.698 2.59 1.056 4.064 1.056h5.946v-9.584h-6.9v3.331h3.254v2.71h-2.18c-.776 0-1.5-.197-2.148-.589a4.5 4.5 0 0 1-1.559-1.567 4.2 4.2 0 0 1-.57-2.156c0-.775.196-1.508.57-2.155a4.3 4.3 0 0 1 1.56-1.568 4.1 4.1 0 0 1 2.146-.587H18V3.96h-5.946c-1.474 0-2.837.357-4.064 1.056"
      />
    </g>
    <defs>
      <clipPath id="Gamma_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgGamma;
