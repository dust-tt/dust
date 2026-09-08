import type { SVGProps } from "react";
import * as React from "react";

const SvgFront = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path fill="#A857F1" d="M2.003 21.604h6.592V8.564h13.143V2H2.003z" />
    <path
      fill="#A857F1"
      d="M16.054 21.996a5.946 5.946 0 1 0 0-11.893 5.946 5.946 0 0 0 0 11.893"
    />
  </svg>
);
export default SvgFront;
