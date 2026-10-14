import type { SVGProps } from "react";
import * as React from "react";

const SvgDj = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M9.13 10.87S2.935 2.928 2.93 2.929A9.97 9.97 0 0 1 10 0c5.523 0 10 4.477 10 10z"
    />
    <path
      fill="#6DA544"
      d="M9.13 10s-6.195 7.073-6.201 7.071A9.97 9.97 0 0 0 9.999 20c5.524 0 10-4.477 10-10z"
    />
    <path
      fill="#F0F0F0"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#D80027"
      d="m4.048 7.391.647 1.993h2.096l-1.696 1.232.648 1.993-1.695-1.232-1.696 1.232L3 10.616 1.305 9.384H3.4z"
    />
  </svg>
);
export default SvgDj;
