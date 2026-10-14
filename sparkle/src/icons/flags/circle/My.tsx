import type { SVGProps } from "react";
import * as React from "react";

const SvgMy = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 20 20"
    {...props}
  >
    <path
      fill="#F0F0F0"
      d="M10 20c5.523 0 10-4.477 10-10S15.523 0 10 0 0 4.477 0 10s4.477 10 10 10"
    />
    <path
      fill="#D80027"
      d="M9.564 10H20c0-.903-.12-1.777-.344-2.609H9.565zM9.564 4.783h8.968a10 10 0 0 0-2.308-2.61h-6.66zM10 20a9.96 9.96 0 0 0 6.225-2.174H3.775A9.96 9.96 0 0 0 10 20M1.467 15.217h17.065a10 10 0 0 0 1.123-2.608H.344a10 10 0 0 0 1.123 2.608"
    />
    <path fill="#0052B4" d="M10 10V0C4.477 0 0 4.477 0 10z" />
    <path
      fill="#FFDA44"
      d="M6.649 8.56A2.473 2.473 0 1 1 7.825 3.91a3.043 3.043 0 1 0 0 4.351c-.35.19-.75.298-1.176.298"
    />
    <path
      fill="#FFDA44"
      d="m7.346 4.348.44.918.99-.23-.443.916.797.633-.993.223.003 1.018-.794-.637-.793.637.002-1.018-.992-.223.797-.633-.444-.915.991.229z"
    />
  </svg>
);
export default SvgMy;
