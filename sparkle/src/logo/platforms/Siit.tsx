import type { SVGProps } from "react";
import * as React from "react";

const SvgSiit = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#026049" rx={6} />
    <g transform="translate(4.25 4.25) scale(.1547)">
      <path
        fill="#fff"
        fillRule="evenodd"
        d="M47.772 2.386 29.901.162C18.461-1.262 8.033 6.858 6.61 18.298L2.888 48.194h18.23l7.035-24.532c1.271-4.433 5.895-6.996 10.327-5.725l9.291 2.664V2.386Zm0 75.727L23.242 71.08c-4.432-1.271-6.995-5.895-5.724-10.327l2.39-8.333H2.362L.162 70.099C-1.262 81.538 6.858 91.967 18.297 93.39l29.475 3.669V78.113Zm4.225 19.472V79.325l9.74 2.793c4.433 1.271 9.057-1.292 10.328-5.725l6.874-23.974h18.096l-3.644 29.283c-1.424 11.44-11.852 19.56-23.292 18.136l-18.102-2.253ZM51.997 21.813V2.912l29.705 3.697c11.44 1.424 19.56 11.852 18.136 23.292l-2.277 18.293H80.15l2.55-8.891c1.271-4.433-1.292-9.057-5.724-10.328l-24.98-7.162Z"
        clipRule="evenodd"
      />
    </g>
  </svg>
);
export default SvgSiit;
