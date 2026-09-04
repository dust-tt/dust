import type { SVGProps } from "react";
import * as React from "react";

const SvgZai = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <rect width={24} height={24} fill="#fff" rx={4} />
    <rect width={22} height={22} x={1} y={1} fill="#2D2D2D" rx={3} />
    <path
      fill="#fff"
      d="m12.47 4.1-1.3 1.85c-.2.29-.54.47-.9.47h-7.1V4.09zM21.3 4.1 10.14 19.91H2.7L13.86 4.1zM11.53 19.91l1.31-1.86c.2-.29.54-.47.9-.47h7.09v2.33z"
    />
  </svg>
);
export default SvgZai;
