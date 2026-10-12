import type { SVGProps } from "react";
import * as React from "react";

const SvgFm = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#338AF3"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#F0F0F0"
      d="m10 4.348.432 1.328h1.397l-1.13.822.432 1.328L10 7.005l-1.13.821.431-1.328-1.13-.822h1.397zM4.348 10l1.328-.432V8.171l.821 1.13 1.329-.431L7.005 10l.82 1.13-1.328-.432-.82 1.13v-1.396zM10 15.652l-.431-1.328H8.172l1.13-.822-.432-1.328 1.13.821 1.13-.821-.431 1.328 1.13.822h-1.397zM15.652 10l-1.328.432v1.397l-.822-1.13-1.328.431.82-1.13-.82-1.13 1.328.432.821-1.13v1.396z"
    />
  </svg>
);
export default SvgFm;
