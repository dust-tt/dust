import type { SVGProps } from "react";
import * as React from "react";

const SvgClEi = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#FCFCFC"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M13.043 8.26v.87h1.193a5.24 5.24 0 0 1-1.932 1.638 1.087 1.087 0 0 0-1.843.516 5.3 5.3 0 0 1-.923 0 1.087 1.087 0 0 0-1.844-.516A5.24 5.24 0 0 1 5.762 9.13h1.194v-.87H3.912a6.087 6.087 0 0 0 12.174 0z"
    />
  </svg>
);
export default SvgClEi;
