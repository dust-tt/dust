import type { SVGProps } from "react";
import * as React from "react";

const SvgIs = (props: SVGProps<SVGSVGElement>) => (
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
      d="M.344 12.609a10 10 0 0 0 3.568 5.325v-5.325zM9.13 19.962Q9.56 20 10 20c4.62 0 8.508-3.134 9.656-7.391H9.13zM19.656 7.391C18.508 3.134 14.62 0 10 0q-.439 0-.87.038v7.353zM3.912 2.066A10 10 0 0 0 .344 7.391h3.568z"
    />
    <path
      fill="#D80027"
      d="M19.915 8.696H7.826V.238c-.924.205-1.8.537-2.609.978v7.48H.085a10 10 0 0 0 0 2.608h5.132v7.48a10 10 0 0 0 2.61.978v-8.457h12.088a10 10 0 0 0 0-2.61"
    />
  </svg>
);
export default SvgIs;
