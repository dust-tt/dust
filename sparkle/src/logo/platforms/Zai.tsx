import type { SVGProps } from "react";
import * as React from "react";

const SvgZai = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    viewBox="0 0 30 30"
    {...props}
  >
    <path
      fill="#2D2D2D"
      stroke="#fff"
      strokeWidth={0.632}
      strokeMiterlimit={10}
      d="M24.51 28.51H5.49c-2.21 0-4-1.79-4-4V5.49c0-2.21 1.79-4 4-4h19.03c2.21 0 4 1.79 4 4v19.03c0 2.21-1.79 4-4 4z"
    />
    <path fill="#fff" d="M15.47 7.1l-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V7.09z" />
    <path fill="#fff" d="M24.3 7.1 13.14 22.91H5.7L16.86 7.1z" />
    <path
      fill="#fff"
      d="M14.53 22.91l1.31-1.86c.2-.29.54-.47.9-.47h7.09v2.33z"
    />
  </svg>
);
export default SvgZai;
