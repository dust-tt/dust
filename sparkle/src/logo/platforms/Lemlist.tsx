import type { SVGProps } from "react";
import * as React from "react";

const SvgLemlist = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#316BFF" rx={6} />
    <path
      fill="#fff"
      fillRule="evenodd"
      d="M15.942 10.93h-4.598a.63.63 0 0 0-.63.629v.883c0 .348.282.63.63.63h4.598a.63.63 0 0 0 .63-.63v-.883a.63.63 0 0 0-.63-.63m-4.598-4.501h5.598a.63.63 0 0 1 .63.63v.883a.63.63 0 0 1-.63.63h-5.598a.63.63 0 0 1-.63-.63v-.883a.63.63 0 0 1 .63-.63m6.227 10.513v-.884a.63.63 0 0 0-.63-.63H10.21a1.637 1.637 0 0 1-1.637-1.638V7.06a.63.63 0 0 0-.63-.63h-.883a.63.63 0 0 0-.63.63v8.045a2.644 2.644 0 0 0 2.467 2.467h8.046a.63.63 0 0 0 .63-.63"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgLemlist;
