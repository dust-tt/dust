import type { SVGProps } from "react";
import * as React from "react";

const SvgValTown = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <g clipPath="url(#ValTown_svg__a)">
      <rect width={24} height={24} fill="#F7F7F7" rx={6} />
      <path
        fill="#000"
        d="M18.503 19.3q-1.08 0-1.751-.67-.672-.672-.672-1.794v-6.16h-1.444V8.388h1.444V5h2.775v3.388h2.995v2.288h-2.995v5.676q0 .66.617.66h2.114V19.3z"
      />
      <path
        fill="#000"
        d="m12.436 9.632-4.613 7.645h-.396V10.06c0-.923-.75-1.671-1.673-1.671H4.652V17.5c0 .994.807 1.8 1.802 1.8H8.34a2.8 2.8 0 0 0 2.424-1.398l5.502-9.514H14.64c-.902 0-1.738.472-2.204 1.243"
      />
      <path fill="#000" d="M2 8.389h2.78v2.288H2z" />
    </g>
    <defs>
      <clipPath id="ValTown_svg__a">
        <path fill="#fff" d="M0 0h24v24H0z" />
      </clipPath>
    </defs>
  </svg>
);
export default SvgValTown;
