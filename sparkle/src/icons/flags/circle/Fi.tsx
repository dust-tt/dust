import type { SVGProps } from "react";
import * as React from "react";

const SvgFi = (props: SVGProps<SVGSVGElement>) => (
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
      d="M19.915 8.696H7.826V.238c-.924.205-1.8.537-2.609.978v7.48H.085a10 10 0 0 0 0 2.608h5.132v7.48a10 10 0 0 0 2.61.978v-8.457h12.088a10 10 0 0 0 0-2.61"
    />
  </svg>
);
export default SvgFi;
