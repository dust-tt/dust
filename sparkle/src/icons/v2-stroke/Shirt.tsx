import type { SVGProps } from "react";
import * as React from "react";

const SvgShirt = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="currentColor" d="M18 12.875a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2z" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M14 .875c1.48 0 2.772.805 3.464 2H19a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3v-14a3 3 0 0 1 3-3h1.536a4 4 0 0 1 3.464-2zm-9 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h6V9.641l-1.97 1.183c-1.334.8-3.03-.161-3.03-1.716V4.875zm13 4.233c0 1.555-1.696 2.516-3.03 1.716L13 9.641v11.234h6a1 1 0 0 0 1-1v-14a1 1 0 0 0-1-1h-1zm-10 0 2.074-1.245L8 5.79zm5.925-1.245L16 9.108V5.79zM10 2.875c-.582 0-1.105.25-1.47.647q.137.109.263.232L12 6.96l3.207-3.207q.126-.124.263-.232A2 2 0 0 0 14 2.875z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgShirt;
