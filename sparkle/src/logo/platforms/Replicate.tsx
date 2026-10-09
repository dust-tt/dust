import type { SVGProps } from "react";
import * as React from "react";

const SvgReplicate = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Replicate_svg__a)">
      <rect width={24} height={24} fill="#000" rx={6} />
      <path
        fill="#fff"
        d="M18.76 6.576H7.766V19H6V5h12.76zm0 2.988h-7.661V19H9.332V7.99h9.428zm0 2.989h-4.328V19h-1.767v-8.032h6.095z"
      />
    </g>
    <defs>
      <clipPath id="Replicate_svg__a">
        <rect width={24} height={24} fill="#fff" rx={4} />
      </clipPath>
    </defs>
  </svg>
);
export default SvgReplicate;
