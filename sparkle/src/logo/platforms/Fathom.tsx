import type { SVGProps } from "react";
import * as React from "react";
const SvgFathom = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#00BEFF"
      d="M17.25 13.608 4.25 6.5c-1.215-.714-1.607-2.107-.893-3.322.714-1.107 2.215-1.5 3.393-.893l13.002 7.108c1.215.715 1.607 2.108.893 3.286-.571 1.215-2.179 1.608-3.393.93Zm-6 4.286-6.894-3.786c-1.214-.714-1.607-2.107-.893-3.286.714-1.107 2.215-1.5 3.393-.893l6.894 3.822c1.215.714 1.608 2.107.893 3.286-.678 1.072-2.179 1.465-3.393.857Z"
    />
    <path
      fill="#00BEFF"
      d="M3.034 19.502v-7.394c0-1.393 1.108-2.5 2.5-2.5 1.394 0 2.501 1.107 2.501 2.5v7.394c0 1.393-1.107 2.5-2.5 2.5a2.485 2.485 0 0 1-2.5-2.5Z"
      opacity={0.5}
    />
  </svg>
);
export default SvgFathom;
