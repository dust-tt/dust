import type { SVGProps } from "react";
import * as React from "react";

const SvgEsIb = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FFDA44"
      d="M10 0c5.523 0 10 4.477 10 10s-4.477 10-10 10S0 15.523 0 10"
    />
    <path
      fill="#D80027"
      d="M9.783 4.444h8.533a10 10 0 0 0-2.03-2.222H9.782zM9.783 8.889H19.94a10 10 0 0 0-.508-2.222H9.783zM.57 13.333h18.86c.25-.707.424-1.451.509-2.222H.063c.085.77.257 1.515.508 2.222M3.714 17.778h12.57a10 10 0 0 0 2.03-2.222H1.685c.561.839 1.247 1.588 2.03 2.222"
    />
    <path fill="#4A1F63" d="M10 0C4.477 0 0 4.477 0 10h10z" />
    <path
      fill="#F0F0F0"
      d="M8.26 5.217v.87h-.434v-.87h-.87v.87h-.434v-1.74h-1.74v1.74h-.434v-.87h-.87v.87h-.435v-.87h-.87v2.61H9.13v-2.61z"
    />
  </svg>
);
export default SvgEsIb;
