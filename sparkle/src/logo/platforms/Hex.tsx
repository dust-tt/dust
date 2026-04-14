import type { SVGProps } from "react";
import * as React from "react";

const SvgHex = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#01011B"
      d="M0 4a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4z"
    />
    <path
      fill="#FEC7C6"
      fillRule="evenodd"
      d="M5.462 8v2.79h-.77V8H2v8h2.692v-4h.77v4h2.692V8zm3.461 8h6.154v-3.2h-2.692v2h-.77V12h3.462V8H8.923zm2.692-5.2V9.2h.77v1.6zm7.693 0V8H22v2l-1.154 1.4L22 12.8V16h-2.692v-4.01h-.77V16h-2.692v-3.2L17 11.4 15.846 10V8h2.692v2.8z"
      clipRule="evenodd"
    />
  </svg>
);
export default SvgHex;
