import type { SVGProps } from "react";
import * as React from "react";

const SvgJm = (props: SVGProps<SVGSVGElement>) => (
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
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#6DA544"
      d="M16.088 2.067A9.96 9.96 0 0 0 10 0a9.96 9.96 0 0 0-6.088 2.067L10 8.155z"
    />
    <path
      fill="#000"
      d="M2.067 3.912A9.96 9.96 0 0 0 0 10c0 2.291.771 4.402 2.067 6.088L8.155 10z"
    />
    <path
      fill="#6DA544"
      d="M3.912 17.933A9.96 9.96 0 0 0 10 20a9.96 9.96 0 0 0 6.088-2.067L10 11.845z"
    />
    <path
      fill="#000"
      d="M17.932 16.088A9.96 9.96 0 0 0 19.999 10a9.96 9.96 0 0 0-2.067-6.088L11.844 10z"
    />
  </svg>
);
export default SvgJm;
