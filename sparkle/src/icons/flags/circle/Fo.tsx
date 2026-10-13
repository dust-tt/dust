import type { SVGProps } from "react";
import * as React from "react";

const SvgFo = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#0052B4"
      d="m19.564 10 .35-1.304a10 10 0 0 0-.26-1.305H9.13V.038q-.667.058-1.305.2L6.086 1.304l-.87-.087q-.686.376-1.304.85V7.39H.344q-.173.637-.26 1.305L.434 10l-.35 1.304q.087.668.26 1.305h3.568v5.325q.617.474 1.305.85l1.304-.088 1.304 1.066q.638.142 1.305.2v-7.353h10.525q.171-.637.26-1.305z"
    />
    <path
      fill="#D80027"
      d="M19.915 8.696H7.826V.238c-.924.205-1.8.537-2.609.978v7.48H.085a10 10 0 0 0 0 2.608h5.132v7.48a10 10 0 0 0 2.61.978v-8.457h12.088a10 10 0 0 0 0-2.61"
    />
  </svg>
);
export default SvgFo;
