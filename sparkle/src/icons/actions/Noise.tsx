import type { SVGProps } from "react";
import * as React from "react";
const SvgNoise = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="currentColor"
      d="M11 7.22 7.603 10H4v4h3.603L11 16.78V7.22ZM6.889 16H2V8h4.889l3.661-2.996c.98-.8 2.45-.104 2.45 1.161v11.67c0 1.265-1.47 1.962-2.45 1.16L6.89 16ZM20.803 4.575 19.39 3.161 15.5 7.051l2.475 2.474L15.5 12l2.475 2.475L15.5 16.95l3.89 3.889 1.413-1.414-2.475-2.475 2.475-2.475-2.475-2.476 2.475-2.474-2.475-2.475 2.475-2.475Z"
    />
  </svg>
);
export default SvgNoise;
