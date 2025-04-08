import type { SVGProps } from "react";
import * as React from "react";
const SvgMegaphone = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="1em"
    height="1em"
    fill="none"
    viewBox="0 0 24 24"
    {...props}
  >
    <path
      fill="#111418"
      d="M9 17s7 1 10 4h1a1 1 0 0 0 1-1v-6.063a2 2 0 0 0 0-3.874V4a1 1 0 0 0-1-1h-1C16 6 9 7 9 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1l1 5h2v-5Zm2-8.339c.683-.146 1.527-.35 2.44-.617 1.678-.494 3.81-1.271 5.56-2.47v12.851c-1.75-1.198-3.883-1.975-5.56-2.469A33.967 33.967 0 0 0 11 15.34V8.66ZM5 9h4v6H5V9Z"
    />
  </svg>
);
export default SvgMegaphone;
