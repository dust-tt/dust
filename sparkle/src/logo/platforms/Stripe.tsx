import type { SVGProps } from "react";
import * as React from "react";

const SvgStripe = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#Stripe_svg__a)">
      <rect width={24} height={24} fill="#635BFF" rx={6} />
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M10.781 8.523c0-.737.605-1.02 1.606-1.02 1.437 0 3.25.434 4.687 1.209V4.27c-1.569-.624-3.118-.87-4.687-.87C8.551 3.402 6 5.406 6 8.75c0 5.215 7.181 4.384 7.181 6.633 0 .869-.756 1.152-1.814 1.152-1.569 0-3.572-.642-5.16-1.511v4.497a13.1 13.1 0 0 0 5.16 1.077c3.93 0 6.633-1.946 6.633-5.329-.019-5.631-7.219-4.63-7.219-6.746"
        clipRule="evenodd"
      />
    </g>
    <defs>
      <clipPath id="Stripe_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgStripe;
