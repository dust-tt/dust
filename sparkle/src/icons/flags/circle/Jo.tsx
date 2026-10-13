import type { SVGProps } from "react";
import * as React from "react";

const SvgJo = (props: SVGProps<SVGSVGElement>) => (
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
    <path fill="#000" d="M6.087 6.522h13.291A10.004 10.004 0 0 0 2.93 2.929z" />
    <path
      fill="#6DA544"
      d="M6.087 13.478h13.291A10.004 10.004 0 0 1 2.93 17.071z"
    />
    <path
      fill="#D80027"
      d="M2.929 2.929c-3.905 3.905-3.905 10.237 0 14.142L10 10z"
    />
    <path
      fill="#F0F0F0"
      d="m3.968 7.826.549 1.148 1.24-.287L5.2 9.832l.997.79-1.241.28.003 1.272-.992-.796-.992.796.003-1.272-1.24-.28.996-.79-.555-1.145 1.24.287z"
    />
  </svg>
);
export default SvgJo;
