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
      <path
        fill="#020617"
        d="M0 4a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4Z"
      />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M18.76 5v1.576H7.765V19H6V5h12.76Zm0 2.989v1.576h-7.661V19H9.332V7.989h9.428Zm0 4.564v-1.585h-6.095V19h1.766v-6.447h4.329Z"
        clipRule="evenodd"
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
