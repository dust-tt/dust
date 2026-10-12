import type { SVGProps } from "react";
import * as React from "react";

const SvgCy = (props: SVGProps<SVGSVGElement>) => (
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
      fill="#6DA544"
      d="M15.652 8.696h-1.304a4.348 4.348 0 1 1-8.696 0H4.348a5.655 5.655 0 0 0 4.108 5.438c-.26.494-.22 1.116.152 1.58l1.42-1.14 1.422 1.14a1.45 1.45 0 0 0 .143-1.594 5.65 5.65 0 0 0 4.059-5.424"
    />
    <path
      fill="#FFDA44"
      d="M6.521 8.26s0 2.175 2.174 2.175l.435.434H10s.434-1.304 1.304-1.304c0 0 0-.87.87-.87h1.304s-.435-1.739 1.74-3.043l-.87-.435s-3.044 2.174-5.218 1.74v.87h-.87l-.434-.436z"
    />
  </svg>
);
export default SvgCy;
