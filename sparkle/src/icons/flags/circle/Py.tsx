import type { SVGProps } from "react";
import * as React from "react";

const SvgPy = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#D80027"
      d="M10 0A10 10 0 0 0 .992 5.652h18.016A10 10 0 0 0 10 0"
    />
    <path
      fill="#0052B4"
      d="M10 20a10 10 0 0 0 9.008-5.652H.992A10 10 0 0 0 10 20"
    />
    <path
      fill="#6DA544"
      d="m12.46 7.106-.923.922a2.174 2.174 0 1 1-3.074 0l-.923-.922a3.478 3.478 0 1 0 4.919 0"
    />
    <path
      fill="#FFDA44"
      d="m10 8.26.324.997h1.048l-.848.616.324.997-.848-.616-.847.616.324-.997-.848-.616h1.048z"
    />
  </svg>
);
export default SvgPy;
