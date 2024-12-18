import type { SVGProps } from "react";
import * as React from "react";
const SvgTSquare = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M2.001 3.557c0-.614-.052-.556.5-.556H21.5c.552 0 .5-.058.5.556v18.886c0 .614.052.555-.5.555H2.5c-.552 0-.5.059-.5-.555zm2 1.666v15.554H20V5.223zm3 3.333h9.998v3.333h-2v-1.11h-2v4.443h1.5v2.222H9.5v-2.222H11v-4.444H9v1.111H7z"
    />
  </svg>
);
export default SvgTSquare;
