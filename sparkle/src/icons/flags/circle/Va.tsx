import type { SVGProps } from "react";
import * as React from "react";

const SvgVa = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 0c5.523 0 10 4.477 10 10s-4.477 10-10 10c0-.435-1.305-10-1.305-10z"
    />
    <path fill="#FFDA44" d="M10 20C4.477 20 0 15.523 0 10S4.477 0 10 0" />
    <path
      fill="#ACABB1"
      d="m13.83 8.702 1.879 2.486a1.304 1.304 0 1 0 .694-.524l-2.93-3.875-.693.524-1.04.787 1.048 1.387zm2.705 2.858a.435.435 0 1 1 .524.694.435.435 0 0 1-.524-.694"
    />
    <path
      fill="#FFDA44"
      d="M17.053 9.487 18.102 8.1l-1.04-.787-.695-.524-2.929 3.875a1.305 1.305 0 1 0 .694.524l1.88-2.486zM13.39 12.17a.435.435 0 1 1-.693-.524.435.435 0 0 1 .694.524"
    />
  </svg>
);
export default SvgVa;
